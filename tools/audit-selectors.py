"""Аудит селекторов: какие правила интерфейса вообще ни к чему не относятся.

Firefox меняет разметку chrome между версиями. Устаревший селектор не даёт
ошибки — правило просто молча ничего не делает, и обнаруживается это уже
глазами на скриншоте. Скрипт сверяет каждый селектор из наших файлов
с живым окном браузера.

Запуск браузера:
    firefox --marionette -remote-allow-system-access --profile .dev-profile

Затем:
    python tools/audit-selectors.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from marionette import Marionette  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CSS_DIR = ROOT / "ui" / "chrome" / "vantara"

GREEN, RED, YELLOW, DIM, RESET = (
    "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m")

# Селекторы этих состояний появляются только при действии пользователя или
# по нашему же скрипту, поэтому в покоящемся окне их закономерно нет.
CONDITIONAL = re.compile(
    # состояния и псевдоэлементы
    r"\[vn-|:hover|:active|:focus|::before|::after|::placeholder|"
    r"\[fadein\]|\[selected\]|\[pinned\]|\[soundplaying\]|\[usercontextid\]|"
    r"\[disabled\]|\[open\]|\[hasException\]|\[focused\]|\[pageproxystate|"
    r":not\(\[|@media|:root\[|\[aria-expanded|\[sidebar-positionend\]|"
    r"\[starred\]|\[badge-status\]|"
    # перетаскивание вкладки к другой: эти атрибуты живут только пока
    # вкладку тащат (drag-and-drop.js движка)
    r"\[movingtab|\[dragover-groupTarget\]|\[multiselected\]|"
    # группы вкладок и их панель: в окне без групп этих элементов нет
    r"tab-group|\.vn-group-|"
    # классы состояния панели доверия (browser-trustPanel.js)
    r"\.(secure|insecure|inactive|scanning|warning|breached)\b|"
    # элементы, которые браузер создаёт только по действию пользователя:
    # панели, меню, подсказки, строка поиска, уведомления
    r"protections-popup|appMenu-popup|urlbarView|findbar|notification-|"
    r"panel-arrowcontent|scrollbar|"
    # наши утилитарные классы: применяются из скриптов, а не из разметки;
    # панель журнала запросов создаётся при первом открытии
    r"\.vn-anim-|\.vn-leaks")


def strip_at_blocks(text: str, keyword: str) -> str:
    """Удаляет правила вида "@keyword ... { ... }" вместе с телом."""
    out, i = [], 0
    while True:
        start = text.find(keyword, i)
        if start == -1:
            out.append(text[i:])
            return "".join(out)
        brace = text.find("{", start)
        if brace == -1:
            out.append(text[i:])
            return "".join(out)
        depth, j = 1, brace + 1
        while j < len(text) and depth:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        out.append(text[i:start])
        i = j


def selectors_from(path: Path) -> list[str]:
    """Вытаскивает селекторы верхнего уровня, пропуская @-правила."""
    text = re.sub(r"/\*.*?\*/", "", path.read_text(encoding="utf-8"), flags=re.S)
    # Внутри @keyframes лежат кадры ("from", "to", "35%"), а не селекторы.
    text = strip_at_blocks(text, "@keyframes")
    text = re.sub(r"@media[^{]*\{", "", text)

    found = []
    for block in re.finditer(r"([^{}]+)\{", text):
        head = block.group(1).strip()
        if not head or head.startswith("@") or ":" in head.split(",")[0][:1]:
            continue
        for part in split_top_level(head):
            part = part.strip()
            # Вложенное правило вида "> .icon" относительно родителя: само
            # по себе в документе не ищется.
            if part and not part.startswith(("@", ">", "+", "~", "&")):
                found.append(part)
    return found


def split_top_level(head: str) -> list[str]:
    """Делит список селекторов по запятым верхнего уровня.

    Запятые внутри :is(...) и :not(...) список не делят: иначе
    "#a:is(.b, .c)" превращается в два обрывка, и оба выглядят мёртвыми.
    """
    parts, depth, current = [], 0, []
    for ch in head:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))
    return parts


# -2: кнопка есть, но лежит в палитре настройки панелей и в окно не
# выставлена. Пользователь может добавить её в любой момент.
PROBE = r"""
const inPalette = sel => {
  const id = /^#([\w-]+)/.exec(sel)?.[1];
  if (!id) return false;
  if (gNavToolbox.palette.querySelector('#' + id)) return true;
  return CustomizableUI.getWidget(id)?.provider == CustomizableUI.PROVIDER_API;
};
const out = {};
for (const sel of arguments[0]) {
  try {
    out[sel] = document.querySelectorAll(sel).length;
    if (!out[sel] && inPalette(sel)) out[sel] = -2;
  }
  catch (e) { out[sel] = -1; }
}
return out;
"""


def main() -> int:
    files = sorted(CSS_DIR.glob("*.css"))
    if not files:
        print(f"{RED}Не найдены файлы в {CSS_DIR}{RESET}")
        return 2

    # pages.css относится к служебным страницам, а не к окну браузера.
    per_file = {f: selectors_from(f) for f in files
                if f.name not in ("tokens.css", "pages.css")}
    every = sorted({s for group in per_file.values() for s in group})

    try:
        with Marionette() as m:
            counts = m.script(PROBE, [every])
    except (ConnectionError, OSError) as exc:
        print(f"{RED}Нет связи с браузером (127.0.0.1:2828){RESET}")
        print(f"{DIM}  {exc}{RESET}")
        return 2

    dead = []

    for path, group in per_file.items():
        rows = []
        for selector in sorted(set(group)):
            count = counts.get(selector, 0)
            conditional = bool(CONDITIONAL.search(selector))

            if count > 0:
                continue                      # работает, показывать нечего
            if conditional or count == -2:
                continue                      # ждёт состояния или кнопки

            rows.append(selector)
            dead.append((path.name, selector))

        if rows:
            print(f"\n{path.name}")
            for selector in rows:
                print(f"  [{RED}МЁРТВ{RESET}] {selector}")

    total = len(every)
    alive = sum(1 for s in every if counts.get(s, 0) > 0)
    waiting = total - alive - len(dead)

    print(f"\n{DIM}Селекторов: {total}  "
          f"работают: {alive}  ждут состояния: {waiting}  "
          f"мертвы: {len(dead)}{RESET}")

    if dead:
        print(f"\n{YELLOW}Мёртвый селектор не ошибка для браузера: правило просто "
              f"ничего не делает.{RESET}")
        return 1

    print(f"{GREEN}Мёртвых селекторов нет{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

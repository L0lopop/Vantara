"""Проверка того, что интерфейс Vantara реально применился к браузеру.

Скриншот показывает результат, но не объясняет причину: почему правило не
сработало — из-за опечатки в селекторе, из-за того что файл не загрузился,
или потому что Firefox перекрыл его своим. Этот скрипт отвечает на вопрос
точно, читая состояние живого окна через Marionette.

Запуск браузера с включённым Marionette:
    firefox --marionette -remote-allow-system-access --profile .dev-profile

Затем:
    python tools/inspect-ui.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from marionette import Marionette, computed  # noqa: E402

# Что проверяем: селектор, свойство, ожидаемое значение.
# Ожидание — то, что задано в ui/chrome/vantara/*.css.
CHECKS = [
    ("#navigator-toolbox", "background-color", "rgb(28, 31, 37)"),
    ("#nav-bar",           "background-color", "rgb(28, 31, 37)"),
    (".urlbar-background", "background-color", "rgb(35, 39, 46)"),
    (".urlbar-background", "border-radius",    "8px"),
    (".urlbar-input-container", "border-radius", "8px"),
    ("#tracking-protection-icon-container", "border-radius", "5px"),
    (".tabbrowser-tab[selected] .tab-background", "background-color", "rgb(45, 50, 58)"),
    (".tabbrowser-tab[selected] .tab-background", "border-radius",    "8px"),
]

TOKENS = ["--vn-bg-chrome", "--vn-bg-surface", "--vn-radius-md", "--vn-edge"]

GREEN, RED, YELLOW, DIM, RESET = (
    "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m")


def main() -> int:
    try:
        session = Marionette()
        session.connect()
    except (ConnectionError, OSError) as exc:
        print(f"{RED}Не удалось подключиться к Marionette (127.0.0.1:2828){RESET}")
        print(f"{DIM}  {exc}{RESET}")
        print("  Браузер запущен с ключами --marionette "
              "-remote-allow-system-access?")
        return 2

    failures = 0

    with session as m:
        print(f"{DIM}Документ: {m.script('return document.documentURI')}{RESET}\n")

        # Firefox фокусирует адресную строку при старте, и тогда замер видит
        # не обычное состояние, а фокус. К тому же в Firefox 156 строка
        # снимает фокус не сразу. Переводим фокус в страницу и ждём два
        # кадра отрисовки — иначе результат зависит от момента запуска.
        m.script("""
          if (typeof gURLBar !== 'undefined' && gURLBar.focused) gURLBar.blur();
          gBrowser.selectedBrowser.focus();
          return new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
        """)

        # 1. Дошли ли токены до корня документа.
        print("Токены в :root")
        values = m.script("""
          const cs = getComputedStyle(document.documentElement);
          const out = {};
          for (const name of arguments[0]) out[name] = cs.getPropertyValue(name).trim();
          return out;
        """, [TOKENS])

        for name in TOKENS:
            value = values.get(name) or ""
            ok = bool(value)
            failures += not ok
            mark = f"{GREEN}OK {RESET}" if ok else f"{RED}НЕТ{RESET}"
            print(f"  [{mark}] {name:18} = {value or 'пусто'}")

        # Отдельной проверки «загружен ли userChrome.css» нет намеренно:
        # он подключается как пользовательская таблица стилей и в
        # document.styleSheets не виден. Доказательство загрузки — сами
        # токены выше: если они на месте, файл прочитан.

        # 2. Выиграли ли наши правила у стилей Firefox.
        print("\nПрименённые стили")
        for selector, prop, expected in CHECKS:
            result = computed(m, selector, [prop])

            if not result.get("found"):
                failures += 1
                print(f"  [{YELLOW}?  {RESET}] {selector}")
                print(f"        элемент не найден — селектор устарел?")
                continue

            actual = result[prop]
            ok = actual == expected
            failures += not ok
            mark = f"{GREEN}OK {RESET}" if ok else f"{RED}НЕТ{RESET}"
            print(f"  [{mark}] {selector}")
            print(f"        {prop}: {actual}")
            if not ok:
                print(f"{DIM}        ожидалось: {expected}{RESET}")

    print()
    if failures:
        print(f"{RED}Расхождений: {failures}{RESET}")
        return 1

    print(f"{GREEN}Интерфейс применён полностью{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

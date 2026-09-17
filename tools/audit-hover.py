"""Аудит подсветки при наведении: у каждой кнопки должен быть один слой.

Замер цвета фона в покое не видит, что происходит при наведении. Так
в сборке прожили два прямоугольника подсветки на одной кнопке: наш фон
на самой кнопке и родной фон Firefox на её иконке, разного размера
и с разным скруглением.

Скрипт через Marionette фиксирует у каждого интерактивного элемента
состояние :hover (InspectorUtils.addPseudoClassLock) и считает видимые
слои с непрозрачным фоном — сам элемент и всё, что внутри. Слоёв должно
быть ровно столько, сколько один: два — двойная подсветка, ноль —
наведение ничем не отмечено.

Запуск браузера — как для остальных проверок:

    vantara.exe --marionette -remote-allow-system-access --profile <каталог>
    python tools/audit-hover.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from marionette import Marionette  # noqa: E402

GREEN, RED, DIM, RESET = "\033[32m", "\033[31m", "\033[2m", "\033[0m"

# Что проверяем. Вкладки проверяются отдельно: у них фон рисует
# .tab-background, и он один на вкладку по устройству.
TARGETS = (
    "#nav-bar toolbarbutton, #TabsToolbar toolbarbutton, "
    "#trust-icon-container, #identity-box, .urlbar-page-action, "
    ".searchmode-switcher, .tab-close-button"
)

PROBE = """
const [selector] = arguments;
const visibleLayers = root => {
  const out = [];
  const walk = el => {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      if (hasBg && cs.visibility !== 'hidden' && cs.opacity !== '0') {
        out.push(`${el.localName}${el.id ? '#' + el.id : ''}` +
                 `${typeof el.className == 'string' && el.className ? '.' + el.className.trim().split(' ')[0] : ''}` +
                 ` ${Math.round(r.width)}x${Math.round(r.height)} r=${cs.borderRadius}`);
      }
    }
    // moz-button и другие элементы-компоненты рисуют фон внутри
    // теневого дерева.
    for (const c of el.shadowRoot?.children ?? []) walk(c);
    for (const c of el.children) walk(c);
  };
  walk(root);
  return out;
};

// Настоящий курсор делает :hover у элемента и у всех его предков
// (а у компонента — и у кнопки внутри). Блокировка ставится так же,
// иначе, например, крестик вкладки меряется в сжатом виде, который
// Firefox показывает только без наведения на вкладку.
const hoverChain = el => {
  const chain = [];
  for (let n = el; n; n = n.parentElement || n.getRootNode().host) {
    if (n.nodeType == 1) chain.push(n);
  }
  const inner = el.shadowRoot?.querySelector('button');
  if (inner) chain.unshift(inner);
  return chain;
};

const result = {};
let index = 0;
for (const el of document.querySelectorAll(selector)) {
  const r = el.getBoundingClientRect();
  if (el.hidden || r.width == 0 || el.hasAttribute('disabled')) continue;
  const name = el.id || `${el.localName}.${String(el.className).split(' ')[0]}#${index++}`;
  const chain = hoverChain(el);
  chain.forEach(n => InspectorUtils.addPseudoClassLock(n, ':hover'));
  // Переходы доводятся до конца: иначе замер попадает в их первый кадр,
  // где у крестика вкладки ещё opacity 0.
  el.getAnimations({ subtree: true }).forEach(a => a.finish());
  result[name] = visibleLayers(el);
  chain.forEach(n => InspectorUtils.removePseudoClassLock(n, ':hover'));
}
return result;
"""


def main() -> int:
    try:
        with Marionette(timeout=60) as m:
            found = m.script(PROBE, [TARGETS])
    except (ConnectionError, OSError) as exc:
        print(f"{RED}Нет связи с браузером (127.0.0.1:2828){RESET}")
        print(f"{DIM}  {exc}{RESET}")
        return 2

    doubled = {name: layers for name, layers in found.items() if len(layers) > 1}
    # Ноль слоёв — тоже ошибка: наведение ничем не отмечено, и кнопка
    # не отвечает пользователю.
    missing = {name for name, layers in found.items() if not layers}

    for name, layers in sorted(found.items()):
        if len(layers) > 1:
            mark = f"{RED}ДВА{RESET}"
        elif not layers:
            mark = f"{RED}НЕТ{RESET}"
        else:
            mark = f"{GREEN}OK {RESET}"
        print(f"  [{mark}] {name}")
        for layer in layers:
            print(f"{DIM}        {layer}{RESET}")

    print(f"\n{DIM}Проверено элементов: {len(found)}{RESET}")
    if doubled or missing:
        if doubled:
            print(f"{RED}С двойной подсветкой: {len(doubled)}{RESET}")
        if missing:
            print(f"{RED}Без подсветки: {len(missing)}{RESET}")
        return 1

    print(f"{GREEN}У каждого элемента ровно один слой подсветки{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

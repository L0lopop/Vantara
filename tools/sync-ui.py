"""Перенос интерфейса из прототипа в сборку.

В прототипе стили лежат в профиле (`userChrome.css`) — это удобно для
отладки, но негодно для продукта: файл профиля пользователь может удалить,
и браузер вернётся к виду Firefox. В сборке интерфейс должен быть частью
приложения.

Скрипт делает три вещи, описанные в docs/BUILD.md:
  1. копирует ui/chrome/vantara/*.css в тему движка;
  2. регистрирует файлы в jar.inc.mn — без этой записи файл молча не
     попадёт в сборку;
  3. добавляет импорт в browser.css каждой платформы.

Работает по исходникам в engine/. Изменения затем экспортируются патчами:

    python tools/sync-ui.py
    npx surfer export-file browser/themes/shared/jar.inc.mn
    npx surfer export-file browser/themes/windows/browser.css
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ui" / "chrome" / "vantara"
THEMES = ROOT / "engine" / "browser" / "themes"
DEST = THEMES / "shared" / "vantara"

JAR = THEMES / "shared" / "jar.inc.mn"
PLATFORM_CSS = [THEMES / "windows" / "browser.css",
                THEMES / "linux" / "browser.css",
                THEMES / "osx" / "browser.css"]

# Порядок значим: токены объявляют переменные, движение — ключевые кадры,
# дальше компоненты в порядке слоёв интерфейса.
ORDER = ["tokens.css", "animations.css", "base.css",
         "tabs.css", "navbar.css", "sidebar.css", "menus.css"]

IMPORT_LINE = '@import url("chrome://browser/skin/vantara/vantara.css");'
MARKER = "# Vantara"


def copy_styles() -> list[str]:
    DEST.mkdir(parents=True, exist_ok=True)
    copied = []

    for name in ORDER:
        source = SRC / name
        if not source.exists():
            print(f"  ПРОПУСК: нет {source.relative_to(ROOT)}")
            continue
        shutil.copy2(source, DEST / name)
        copied.append(name)

    # Точка входа темы: один файл, который тянет остальные. Так в
    # jar.inc.mn и в browser.css платформы упоминается ровно одна строка.
    entry = ['/* This Source Code Form is subject to the terms of the Mozilla Public',
             ' * License, v. 2.0. If a copy of the MPL was not distributed with this',
             ' * file, You can obtain one at http://mozilla.org/MPL/2.0/. */',
             '',
             '/* Vantara — интерфейс браузера.',
             '   Создаётся tools/sync-ui.py из ui/chrome/vantara/. Править там. */',
             '']
    entry += [f'@import url("chrome://browser/skin/vantara/{n}");' for n in copied]
    (DEST / "vantara.css").write_text("\n".join(entry) + "\n", encoding="utf-8")
    copied.append("vantara.css")

    print(f"  Скопировано файлов: {len(copied)}")
    return copied


def register_in_jar(files: list[str]) -> None:
    """Прописывает файлы в упаковку. Незарегистрированный файл не попадёт
    в сборку, и никакой ошибки при этом не будет."""
    text = JAR.read_text(encoding="utf-8")

    if MARKER in text:
        # Срезаем прошлый блок целиком, чтобы не плодить дубли.
        head, _, rest = text.partition(MARKER)
        _, _, tail = rest.partition("\n\n")
        text = head.rstrip() + "\n\n" + tail.lstrip()

    block = [f"{MARKER}: интерфейс, создаётся tools/sync-ui.py"]
    for name in files:
        target = f"skin/classic/browser/vantara/{name}"
        block.append(f"  {target:<58} (../shared/vantara/{name})")

    JAR.write_text(text.rstrip() + "\n\n" + "\n".join(block) + "\n",
                   encoding="utf-8")
    print(f"  jar.inc.mn: записей {len(files)}")


def add_import() -> None:
    """Подключает тему к каждой платформе. Импорт обязан идти раньше
    любых правил, иначе браузер его проигнорирует."""
    for css in PLATFORM_CSS:
        if not css.exists():
            continue
        text = css.read_text(encoding="utf-8")
        if IMPORT_LINE in text:
            print(f"  {css.parent.name}/browser.css: импорт уже есть")
            continue

        lines = text.splitlines()
        # Встаём сразу после последнего существующего @import.
        last = max((i for i, l in enumerate(lines)
                    if l.strip().startswith("@import")), default=-1)
        if last == -1:
            print(f"  {css.parent.name}/browser.css: не найден ни один @import")
            continue

        lines.insert(last + 1, IMPORT_LINE)
        css.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"  {css.parent.name}/browser.css: импорт добавлен")


def main() -> int:
    if not THEMES.exists():
        print(f"Нет движка: {THEMES.relative_to(ROOT)}")
        print("Сначала: npx surfer download")
        return 2

    print("Перенос интерфейса в тему")
    files = copy_styles()
    if not files:
        print("Нечего переносить")
        return 1

    register_in_jar(files)
    add_import()

    print()
    print("Дальше:")
    print("  npx surfer export-file browser/themes/shared/jar.inc.mn")
    print("  npx surfer export-file browser/themes/windows/browser.css")
    print("  .\\tools\\mach.ps1 build")
    return 0


if __name__ == "__main__":
    sys.exit(main())

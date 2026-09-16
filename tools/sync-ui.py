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

PREFS_SRC = ROOT / "ui" / "prefs" / "user.js"
# Имя начинается с «00-» не для красоты. Движок читает файлы заводских
# настроек в ОБРАТНОМ алфавитном порядке (Preferences.cpp:
# pref_CompareFileNames и обход prefEntries с конца), и при совпадении
# побеждает прочитанный последним. Последним читается алфавитно первый.
# С именем vantara.js файл читался первым, firefox.js затирал его, и
# четверть наших настроек в собранном браузере не действовала.
PREFS_NAME = "00-vantara.js"
LEGACY_PREFS_NAME = "vantara.js"
PREFS_TARGETS = [ROOT / "engine" / "browser" / "app" / "profile" / PREFS_NAME,
                 ROOT / "src" / "browser" / "app" / "profile" / PREFS_NAME]
# Всё начиная с этой секции нужно только прототипу поверх готового Firefox.
PROTOTYPE_ONLY = "== 11. Прототипирование"

SCRIPTS_SRC = ROOT / "ui" / "scripts"
SCRIPTS_TARGETS = [ROOT / "engine" / "browser" / "base" / "content" / "vantara",
                   ROOT / "src" / "browser" / "base" / "content" / "vantara"]
BASE_JAR = ROOT / "engine" / "browser" / "base" / "jar.mn"
BROWSER_MAIN = ROOT / "engine" / "browser" / "base" / "content" / "browser-main.js"

BROWSER_MOZBUILD = ROOT / "engine" / "browser" / "moz.build"
PACKAGE_MANIFEST = ROOT / "engine" / "browser" / "installer" / "package-manifest.in"


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


def sync_prefs() -> None:
    """Превращает профиль приватности в заводские настройки.

    В прототипе ui/prefs/user.js лежит в профиле — и работает, только пока
    профиль тот самый. Установленный у пользователя браузер его не видит,
    и без этого шага строгая защита от слежки, HTTPS-only и изоляция кук
    остаются только у разработчика.

    user_pref() становится pref(): это заводское значение, которое
    пользователь по-прежнему может изменить. Секции для прототипа отрезаются.
    """
    text = PREFS_SRC.read_text(encoding="utf-8")

    cut = text.find(PROTOTYPE_ONLY)
    if cut != -1:
        # Отрезаем от начала строки-заголовка, чтобы не оставить обрывок.
        text = text[:text.rfind("\n", 0, cut) + 1]

    body = "\n".join(
        "pref(" + line[len("user_pref("):] if line.startswith("user_pref(") else line
        for line in text.splitlines()
    )

    header = (
        "/* This Source Code Form is subject to the terms of the Mozilla Public\n"
        " * License, v. 2.0. If a copy of the MPL was not distributed with this\n"
        " * file, You can obtain one at http://mozilla.org/MPL/2.0/. */\n"
        "\n"
        "/* Vantara — заводские настройки.\n"
        " * Создаётся tools/sync-ui.py из ui/prefs/user.js. Править там.\n"
        " *\n"
        " * Файл читается после firefox.js (порядок алфавитный) и перекрывает\n"
        " * его значения. Он проходит через препроцессор сборки, поэтому строка\n"
        " * не может начинаться с символа решётки. */\n\n"
    )

    for target in PREFS_TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(header + body.rstrip() + "\n", encoding="utf-8")
        # Файл под старым именем читался бы первым и лишь сбивал с толку.
        legacy = target.with_name(LEGACY_PREFS_NAME)
        if legacy.exists():
            legacy.unlink()
            print(f"  удалён устаревший {legacy.relative_to(ROOT)}")

    count = sum(1 for l in body.splitlines() if l.startswith("pref("))
    print(f"  {PREFS_NAME}: заводских настроек {count}")


def register_prefs() -> None:
    """Прописывает файл настроек в сборку и в установщик.

    Два места, и оба обязательны: без moz.build файла нет в сборке,
    без package-manifest его нет в установщике — и в обоих случаях
    никакой ошибки, браузер просто работает на настройках Firefox.
    """
    # Регистрируется в JS_PREFERENCE_FILES, а не рядом с firefox.js в
    # JS_PREFERENCE_PP_FILES. Файлы из PP-списка идут через препроцессор,
    # и он падает на файле без единой директивы: «no preprocessor directives
    # found». Нашему файлу препроцессор не нужен, а каталог назначения у
    # обоих списков один и тот же.
    text = BROWSER_MOZBUILD.read_text(encoding="utf-8")
    entry = f'    "app/profile/{PREFS_NAME}",'
    legacy_entry = f'    "app/profile/{LEGACY_PREFS_NAME}",'

    # Прошлые версии скрипта ставили запись в PP-список и под старым именем.
    text = text.replace(f'    "app/profile/firefox.js",\n{legacy_entry}\n',
                        '    "app/profile/firefox.js",\n')
    text = text.replace(legacy_entry, entry)

    block = ("# Vantara: заводские настройки. Без препроцессора — см. tools/sync-ui.py.\n"
             f"JS_PREFERENCE_FILES += [\n{entry}\n]\n")
    if block not in text:
        text = text.replace("FINAL_TARGET_FILES.defaults += [\"app/permissions\"]\n",
                            "FINAL_TARGET_FILES.defaults += [\"app/permissions\"]\n\n"
                            + block, 1)
        print("  browser/moz.build: файл настроек зарегистрирован")
    BROWSER_MOZBUILD.write_text(text, encoding="utf-8")

    text = PACKAGE_MANIFEST.read_text(encoding="utf-8")
    line = f"@RESPATH@/browser/@PREF_DIR@/{PREFS_NAME}"
    text = text.replace(f"@RESPATH@/browser/@PREF_DIR@/{LEGACY_PREFS_NAME}\n", "")
    if line not in text:
        text = text.replace("@RESPATH@/browser/@PREF_DIR@/firefox-branding.js\n",
                            f"@RESPATH@/browser/@PREF_DIR@/firefox-branding.js\n{line}\n")
        PACKAGE_MANIFEST.write_text(text, encoding="utf-8")
        print("  package-manifest.in: файл настроек попадёт в установщик")


def sync_scripts() -> None:
    """Подключает скрипты окна: функции, которых в Firefox нет.

    Три места, и каждое обязательно. Без записи в jar.mn файла нет
    в сборке, без строки в browser-main.js он есть, но не выполняется —
    и в обоих случаях ни одной ошибки.
    """
    scripts = sorted(SCRIPTS_SRC.glob("*.js"))
    if not scripts:
        print("  скриптов нет")
        return

    for target in SCRIPTS_TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        for script in scripts:
            shutil.copy2(script, target / script.name)
    print(f"  скопировано скриптов: {len(scripts)}")

    jar = BASE_JAR.read_text(encoding="utf-8")
    anchor = "        content/browser/browser-main.js"
    added = 0
    for script in scripts:
        entry = (f"        content/browser/vantara/{script.name:<31} "
                 f"(content/vantara/{script.name})")
        if f"content/browser/vantara/{script.name}" in jar:
            continue
        # Встаём перед browser-main.js: порядок строк в jar.mn не важен,
        # но так наши записи легко найти глазами.
        jar = jar.replace(anchor, entry + "\n" + anchor, 1)
        added += 1
    BASE_JAR.write_text(jar, encoding="utf-8")
    print(f"  browser/base/jar.mn: новых записей {added}")

    main_js = BROWSER_MAIN.read_text(encoding="utf-8")
    loaded = 0
    for script in scripts:
        line = (f'  Services.scriptloader.loadSubScript('
                f'"chrome://browser/content/vantara/{script.name}", this);')
        if line in main_js:
            continue
        # После скрипта защиты: щит опирается на его разметку.
        main_js = main_js.replace(
            '  Services.scriptloader.loadSubScript('
            '"chrome://browser/content/browser-customtitlebar.js", this);\n',
            '  Services.scriptloader.loadSubScript('
            '"chrome://browser/content/browser-customtitlebar.js", this);\n'
            + line + "\n", 1)
        loaded += 1
    BROWSER_MAIN.write_text(main_js, encoding="utf-8")
    print(f"  browser-main.js: подключено {loaded}")


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

    print("\nПеренос настроек приватности")
    sync_prefs()
    register_prefs()

    print("\nПеренос скриптов окна")
    sync_scripts()

    print()
    print("Дальше: экспортировать изменённые файлы движка патчами и собрать.")
    print("  npx surfer export-file browser/moz.build")
    print("  npx surfer export-file browser/installer/package-manifest.in")
    print("  npx surfer export-file browser/base/jar.mn")
    print("  npx surfer export-file browser/base/content/browser-main.js")
    print("  .\\tools\\mach.ps1 build")
    return 0


if __name__ == "__main__":
    sys.exit(main())

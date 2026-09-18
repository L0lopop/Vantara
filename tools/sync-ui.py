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

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ui" / "chrome" / "vantara"
THEMES = ROOT / "engine" / "browser" / "themes"
DEST = THEMES / "shared" / "vantara"
# Копия в src/ обязательна: движок пересоздаётся из src/ при каждом
# обновлении Firefox (surfer import). Без неё там оставались старые стили,
# и обновление молча вернуло бы исправленные ошибки.
SRC_DEST = ROOT / "src" / "browser" / "themes" / "shared" / "vantara"

JAR = THEMES / "shared" / "jar.inc.mn"
PLATFORM_CSS = [THEMES / "windows" / "browser.css",
                THEMES / "linux" / "browser.css",
                THEMES / "osx" / "browser.css"]

# Порядок значим: токены объявляют переменные, движение — ключевые кадры,
# дальше компоненты в порядке слоёв интерфейса.
ORDER = ["tokens.css", "animations.css", "base.css", "icons.css",
         "tabs.css", "navbar.css", "sidebar.css", "menus.css", "leaks.css"]

# Иконки интерфейса. Спрайт — вариант для веб-страниц (currentColor),
# в интерфейсе браузера он не работает и в тему не копируется.
ICONS_SRC = SRC / "icons"
ICONS_SKIP = {"sprite.svg"}

IMPORT_LINE = '@import url("chrome://browser/skin/vantara/vantara.css");'

# Служебные страницы (about:preferences и другие). Их красит отдельный
# пользовательский лист about-pages.css, собранный из tokens.css и
# pages.css. Список адресов — единственное, что пускает лист на страницу:
# обычные сайты его не видят.
PAGES_SOURCE = SRC / "pages.css"
PAGES_NAME = "about-pages.css"
PAGES_URLS = [
    "about:preferences", "about:settings", "about:addons", "about:config",
    "about:support", "about:profiles", "about:downloads", "about:logins",
    "about:protections", "about:privatebrowsing", "about:policies",
    "about:about", "about:processes", "about:license", "about:rights",
    "about:certerror", "about:neterror", "about:httpsonlyerror",
    "about:blocked", "about:unloads", "about:translations",
    "about:serviceworkers", "about:crashes", "about:editprofile",
    "about:profilemanager", "about:deleteprofile", "about:loginsimportreport",
]
MARKER = "# Vantara"

# Талисман Firefox (лиса Kit) и его логотип в интерфейсе. Вместо них
# подставляется знак Vantara: строки override в манифесте пакета
# перенаправляют адреса Firefox на наши файлы, не трогая код, который их
# показывает. Так замена переживает обновление движка.
ILLUSTRATION_NAME = "illustration.svg"
ILLUSTRATION_SOURCE = ROOT / "brand" / "logo" / "mark.png"
ILLUSTRATION_OVERRIDES = [
    "chrome://global/skin/illustrations/kit-concerned.svg",
    "chrome://global/skin/illustrations/kit-confetti.svg",
    "chrome://global/skin/illustrations/kit-happy.svg",
    "chrome://global/skin/illustrations/kit-in-circle.svg",
    "chrome://global/skin/illustrations/kit-holding-lock.svg",
    "chrome://mozapps/skin/extensions/kit-addons.svg",
    "chrome://mozapps/skin/extensions/kit-themes.svg",
    "chrome://browser/skin/sidebar/kit-page-history.svg",
    "chrome://browser/skin/sidebar/kit-tabs-devices.svg",
    "chrome://browser/skin/sidebar/kit-tabs-devices-error.svg",
    "chrome://browser/skin/sidebar/kit-qr-tabs-devices-empty.svg",
    "chrome://browser/content/kit-signed-out.svg",
]
# Значок-логотип Firefox (пункт «О браузере» в настройках, боковая панель)
# -> щит Vantara из набора иконок.
ICON_OVERRIDES = {
    "chrome://browser/skin/sidebar/firefox.svg": "icons/shield.svg",
    # Щит на странице защиты. Страница — обычный документ, context-fill
    # там не работает, поэтому щит перекрашен в цвет защиты заранее.
    "chrome://browser/content/logos/tracking-protection.svg": "shield-page.svg",
    "chrome://browser/content/logos/tracking-protection-dark-theme.svg": "shield-page.svg",
    # Картинка в панели доверия у адресной строки: у Firefox там лиса.
    "chrome://browser/skin/trustpanel-graphic-enabled.svg": "icons/shield.svg",
    "chrome://browser/skin/trustpanel-graphic-disabled.svg": "icons/shield-off.svg",
    "chrome://browser/skin/trustpanel-graphic-warning.svg": "icons/shield-off.svg",
}
# Цвет защиты (--vn-guard), чуть темнее, чтобы щит читался и на светлом фоне.
SHIELD_PAGE_COLOR = "#4FA37E"

PREFS_SRC = ROOT / "ui" / "prefs" / "user.js"
# Имя начинается с «00-» не для красоты. Движок читает файлы заводских
# настроек в ОБРАТНОМ алфавитном порядке (Preferences.cpp:
# pref_CompareFileNames и обход prefEntries с конца), и при совпадении
# побеждает прочитанный последним. Последним читается алфавитно первый.
# С именем vantara.js файл читался первым, firefox.js затирал его, и
# четверть наших настроек в собранном браузере не действовала.
PREFS_NAME = "00-vantara.js"
LEGACY_PREFS_NAME = "vantara.js"

# Настройки из профиля, которые в заводские значения не переносятся.
# Категорию защиты Firefox как заводское значение игнорирует: при старте
# он объявляет её «стандартной». На новом профиле её выставляет
# ui/scripts/vantara-protection.js.
NOT_A_DEFAULT = {"browser.contentblocking.category"}
PREFS_TARGETS = [ROOT / "engine" / "browser" / "app" / "profile" / PREFS_NAME,
                 ROOT / "src" / "browser" / "app" / "profile" / PREFS_NAME]
# Всё начиная с этой секции нужно только прототипу поверх готового Firefox.
PROTOTYPE_ONLY = "== 11. Прототипирование"

SCRIPTS_SRC = ROOT / "ui" / "scripts"
SCRIPTS_TARGETS = [ROOT / "engine" / "browser" / "base" / "content" / "vantara",
                   ROOT / "src" / "browser" / "base" / "content" / "vantara"]
BASE_JAR = ROOT / "engine" / "browser" / "base" / "jar.mn"
BROWSER_MAIN = ROOT / "engine" / "browser" / "base" / "content" / "browser-main.js"

# Модули браузера (ES-модули основного процесса): загружаются по адресу
# chrome://browser/content/vantara/modules/, например из акторов.
MODULES_SRC = ROOT / "ui" / "modules"
MODULES_TARGETS = [target / "modules" for target in SCRIPTS_TARGETS]

# Страница новой вкладки. В прототипе она ссылается на файлы по всему
# репозиторию; в сборке всё лежит в одном каталоге пакета browser,
# открытого для вкладок (contentaccessible=yes). Адрес страницы задан
# в AboutNewTabRedirector.sys.mjs.
NEWTAB_SRC = ROOT / "ui" / "pages" / "newtab"
NEWTAB_TARGETS = [target / "newtab" for target in SCRIPTS_TARGETS]
NEWTAB_FILES = {
    "index.html": NEWTAB_SRC / "index.html",
    "newtab.css": NEWTAB_SRC / "newtab.css",
    "newtab.js": NEWTAB_SRC / "newtab.js",
    "url-parse.js": NEWTAB_SRC / "url-parse.js",
    "strings.js": NEWTAB_SRC / "strings.js",
    "tokens.css": SRC / "tokens.css",
    "animations.css": SRC / "animations.css",
    "mark.png": ROOT / "brand" / "logo" / "mark.png",
}
# Спрайт встраивается в саму страницу. Внешний <use> браузер рисует только
# с того же источника, а у страницы источник about:, у спрайта — chrome:.
# Иконки при этом просто не появляются, без ошибки.
NEWTAB_SPRITE = ICONS_SRC / "sprite.svg"
NEWTAB_SPRITE_REF = "../../chrome/vantara/icons/sprite.svg#"
# Пути прототипа -> полные адреса в пакете. Относительные пути в сборке
# не работают: адрес документа — about:newtab или about:home, и от него
# относительный путь не строится. Браузер отбрасывает такой src
# с предупреждением, и страница остаётся без стилей и скриптов.
NEWTAB_BASE = "chrome://browser/content/vantara/newtab/"
NEWTAB_PATHS = {
    NEWTAB_SPRITE_REF: "#",
    "../../chrome/vantara/tokens.css": NEWTAB_BASE + "tokens.css",
    "../../chrome/vantara/animations.css": NEWTAB_BASE + "animations.css",
    "../../../brand/logo/mark.png": NEWTAB_BASE + "mark.png",
    'href="newtab.css"': f'href="{NEWTAB_BASE}newtab.css"',
    'src="newtab.js"': f'src="{NEWTAB_BASE}newtab.js"',
    "from './url-parse.js'": f"from '{NEWTAB_BASE}url-parse.js'",
    "from './strings.js'": f"from '{NEWTAB_BASE}strings.js'",
}
# Страница без сети: грузить можно только из пакетов браузера. Картинки
# data: — значки сайтов, которые браузер берёт из своей истории.
# frame-ancestors в meta не поддерживается; от встраивания страницу
# закрывает сам адрес about:, недоступный сайтам.
NEWTAB_CSP = ('<meta http-equiv="Content-Security-Policy" '
              'content="default-src chrome:; img-src chrome: data:; '
              'object-src \'none\'; base-uri \'none\'">')

BROWSER_MOZBUILD = ROOT / "engine" / "browser" / "moz.build"
PACKAGE_MANIFEST = ROOT / "engine" / "browser" / "installer" / "package-manifest.in"


def copy_styles() -> list[str]:
    copied = []

    for icon in sorted(ICONS_SRC.glob("*.svg")):
        if icon.name in ICONS_SKIP:
            continue
        for dest in (DEST, SRC_DEST):
            (dest / "icons").mkdir(parents=True, exist_ok=True)
            shutil.copy2(icon, dest / "icons" / icon.name)
        copied.append(f"icons/{icon.name}")

    for name in ORDER:
        source = SRC / name
        if not source.exists():
            print(f"  ПРОПУСК: нет {source.relative_to(ROOT)}")
            continue
        for dest in (DEST, SRC_DEST):
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest / name)
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
    entry += [f'@import url("chrome://browser/skin/vantara/{n}");'
              for n in copied if n.endswith(".css")]
    for dest in (DEST, SRC_DEST):
        (dest / "vantara.css").write_text("\n".join(entry) + "\n", encoding="utf-8")
    copied.append("vantara.css")

    build_pages_sheet()
    copied.append(PAGES_NAME)

    build_illustration()
    copied.append(ILLUSTRATION_NAME)

    shield = (ICONS_SRC / "shield.svg").read_text(encoding="utf-8")
    shield = shield.replace("context-fill", SHIELD_PAGE_COLOR)
    for dest in (DEST, SRC_DEST):
        (dest / "shield-page.svg").write_text(shield, encoding="utf-8", newline="\n")
    copied.append("shield-page.svg")

    icons = sum(1 for n in copied if n.startswith("icons/"))
    print(f"  Скопировано: стилей {len(copied) - icons}, иконок {icons}")
    return copied


def build_illustration() -> None:
    """Иллюстрация вместо талисмана Firefox: знак Vantara в SVG-обёртке.

    Обёртка нужна, чтобы адрес с расширением .svg отдавал SVG: часть
    страниц рисует эти картинки как SVG. Растр внутри уменьшен до 240 px —
    иллюстрации показываются не крупнее.
    """
    import base64
    import io
    from PIL import Image

    with Image.open(ILLUSTRATION_SOURCE) as image:
        image.thumbnail((240, 240), Image.LANCZOS)
        width, height = image.size
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
    data = base64.b64encode(buffer.getvalue()).decode("ascii")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" '
           f'xmlns:xlink="http://www.w3.org/1999/xlink" '
           f'viewBox="0 0 {width} {height}" width="{width}" height="{height}">'
           f'<image width="{width}" height="{height}" '
           f'href="data:image/png;base64,{data}"/></svg>\n')
    for dest in (DEST, SRC_DEST):
        (dest / ILLUSTRATION_NAME).write_text(svg, encoding="utf-8", newline="\n")
    print(f"  {ILLUSTRATION_NAME}: {len(svg) // 1024} КБ, замен {len(ILLUSTRATION_OVERRIDES)}")


def build_pages_sheet() -> None:
    """Собирает about-pages.css: токены и pages.css внутри @-moz-document.

    На служебных страницах нет атрибута vn-palette, поэтому блоки палитр
    из tokens.css переводятся на @media -moz-pref(): Firefox сам
    пересчитывает такие запросы, когда настройка меняется.
    """
    tokens = (SRC / "tokens.css").read_text(encoding="utf-8")
    palettes = re.compile(r':root\[vn-palette="([\w-]+)"\]\s*\{([^}]*)\}')
    found = palettes.findall(tokens)
    if not found:
        raise SystemExit("  tokens.css: не найдено ни одной палитры")
    tokens = palettes.sub(
        lambda m: (f'@media -moz-pref("vantara.theme.palette", "{m.group(1)}") {{\n'
                   f'  :root {{{m.group(2)}}}\n}}'),
        tokens)
    # Выбор схемы атрибутом и темой Firefox на страницах не нужен:
    # они следуют схеме браузера сами.
    tokens = re.sub(r'\n:root\[vn-theme="\w+"\],\n[^{]*\{[^}]*\}\n', "\n", tokens)

    urls = ",\n  ".join(f'url-prefix("{url}")' for url in PAGES_URLS)
    sheet = "\n".join([
        "/* This Source Code Form is subject to the terms of the Mozilla Public",
        " * License, v. 2.0. If a copy of the MPL was not distributed with this",
        " * file, You can obtain one at http://mozilla.org/MPL/2.0/. */",
        "",
        "/* Vantara — служебные страницы. Создаётся tools/sync-ui.py из",
        "   ui/chrome/vantara/tokens.css и pages.css. Править там. */",
        "",
        f"@-moz-document {urls} {{",
        "",
        tokens.strip(),
        "",
        PAGES_SOURCE.read_text(encoding="utf-8").strip(),
        "",
        "}",
        "",
    ])
    for dest in (DEST, SRC_DEST):
        (dest / PAGES_NAME).write_text(sheet, encoding="utf-8", newline="\n")
    print(f"  {PAGES_NAME}: страниц {len(PAGES_URLS)}, палитр {len(found)}")


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
    base = "chrome://browser/skin/vantara/"
    for original in ILLUSTRATION_OVERRIDES:
        block.append(f"% override {original} {base}{ILLUSTRATION_NAME}")
    for original, name in ICON_OVERRIDES.items():
        block.append(f"% override {original} {base}{name}")

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

    def convert(line: str) -> str | None:
        if not line.startswith("user_pref("):
            return line
        name = line[len('user_pref("'):].split('"', 1)[0]
        if name in NOT_A_DEFAULT:
            return None
        return "pref(" + line[len("user_pref("):]

    body = "\n".join(l for l in map(convert, text.splitlines()) if l is not None)

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


def sync_modules() -> None:
    """Кладёт модули основного процесса в пакет browser.

    В отличие от скриптов окна, модули в окно не подключаются: их
    импортирует тот, кому они нужны (ChromeUtils.importESModule).
    """
    modules = sorted(MODULES_SRC.glob("*.sys.mjs"))
    for target in MODULES_TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        for module in modules:
            shutil.copy2(module, target / module.name)
    print(f"  скопировано модулей: {len(modules)}")

    jar = BASE_JAR.read_text(encoding="utf-8")
    anchor = "        content/browser/browser-main.js"
    added = 0
    for module in modules:
        path = f"content/browser/vantara/modules/{module.name}"
        if path in jar:
            continue
        entry = f"        {path:<55} (content/vantara/modules/{module.name})"
        jar = jar.replace(anchor, entry + "\n" + anchor, 1)
        added += 1
    BASE_JAR.write_text(jar, encoding="utf-8")
    print(f"  browser/base/jar.mn: новых записей {added}")


def sync_newtab() -> None:
    """Кладёт страницу новой вкладки в пакет браузера.

    Пути к общим файлам переписываются на плоские. Тема страницы в сборке
    не закреплена за тёмной, как в прототипе, а следует системе.
    """
    for target in NEWTAB_TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        for name, source in NEWTAB_FILES.items():
            if source.suffix in {".html", ".js"}:
                text = source.read_text(encoding="utf-8")
                for old, new in NEWTAB_PATHS.items():
                    text = text.replace(old, new)
                if name == "index.html":
                    text = text.replace(' vn-theme="dark"', "", 1)
                    text = text.replace('<meta charset="utf-8">',
                                        '<meta charset="utf-8">\n' + NEWTAB_CSP, 1)
                    sprite = NEWTAB_SPRITE.read_text(encoding="utf-8").strip()
                    # style-атрибут запрещён политикой страницы: спрайт
                    # остался бы видимым блоком 300x150 и сдвинул вёрстку.
                    sprite = sprite.replace(' style="display:none"',
                                            ' class="vn-sprite" aria-hidden="true"', 1)
                    if 'class="vn-sprite"' not in sprite:
                        raise SystemExit("  sprite.svg: не найден style скрытия")
                    text = text.replace("<body>", "<body>\n" + sprite, 1)
                # Любой оставшийся относительный путь сломает страницу
                # молча — лучше остановить перенос.
                relative = re.search(r'''(?:href|src)=["'](?!chrome:|#|https?:)'''
                                     r'''|from ['"]\.''', text)
                if relative:
                    raise SystemExit(f"  {name}: относительный путь: {relative.group(0)}")
                (target / name).write_text(text, encoding="utf-8", newline="\n")
            elif name == "mark.png":
                # Исходник — 415 px и 230 КБ, на странице знак 56 px.
                # Вдвое больше показа хватает для экранов с высокой плотностью.
                from PIL import Image
                with Image.open(source) as image:
                    image.thumbnail((112, 112), Image.LANCZOS)
                    image.save(target / name, optimize=True)
            else:
                shutil.copy2(source, target / name)
    print(f"  скопировано файлов: {len(NEWTAB_FILES)}")

    jar = BASE_JAR.read_text(encoding="utf-8")
    anchor = "        content/browser/browser-main.js"
    added = 0
    for name in NEWTAB_FILES:
        path = f"content/browser/vantara/newtab/{name}"
        if path in jar:
            continue
        entry = f"        {path:<55} (content/vantara/newtab/{name})"
        jar = jar.replace(anchor, entry + "\n" + anchor, 1)
        added += 1
    BASE_JAR.write_text(jar, encoding="utf-8")
    print(f"  browser/base/jar.mn: новых записей {added}")


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

    print("\nПеренос модулей")
    sync_modules()

    print("\nПеренос новой вкладки")
    sync_newtab()

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

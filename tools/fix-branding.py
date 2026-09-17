"""Вычистка чужих адресов из брендинга после surfer import.

Surfer написан командой Zen Browser и жёстко вшивает в собираемый браузер
ссылки на zen-browser.app: приветственную страницу, политику приватности,
страницу обновлений. Туда же уходит HelpLink — то есть отчёты об ошибках
наших пользователей попадали бы в чужой трекер.

Настройкой это не отключается, значения захардкожены в самом инструменте.
Поэтому после каждого `surfer import` файлы брендинга переписываются здесь.

Для браузера, который обещает не ходить в сеть без спроса, это не
косметика: с чужими адресами первый же запуск открывал бы сайт
постороннего проекта.

    python tools/fix-branding.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = "stable"
BRANDING = ROOT / "engine" / "browser" / "branding" / BRAND

REPO = "https://github.com/L0lopop/Vantara"

# Настройки профиля. Пустая строка означает «никуда не ходить»: у Vantara
# нет ни приветственной страницы, ни экрана «что нового», потому что
# первый запуск не должен отличаться от любого другого.
PREFS = f'''/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara: адреса брендинга.
 *
 * Пустые значения — не упущение, а решение. Браузер не открывает
 * приветственную страницу, не показывает «что нового» после обновления
 * и не ходит в сеть до того, как пользователь что-то сделал.
 *
 * Файл создаётся заново tools/fix-branding.py после каждого surfer import:
 * инструмент сборки подставляет сюда адреса своего проекта. */

pref("startup.homepage_override_url", "");
pref("startup.homepage_welcome_url", "");
pref("startup.homepage_welcome_url.additional", "");

/* Обновления и примечания к выпуску ведут в наш репозиторий. */
pref("app.update.url.manual", "{REPO}/releases");
pref("app.update.url.details", "{REPO}/releases/latest");
pref("app.releaseNotesURL", "{REPO}/releases");
pref("app.releaseNotesURL.aboutDialog", "{REPO}/releases/tag/v%VERSION%");
pref("app.releaseNotesURL.prompt", "{REPO}/releases");

/* Сколько ждать перед крупным уведомлением об обновлении: 8 суток. */
pref("app.update.promptWaitTime", 691200);

/* Вставка кода в веб-консоль без предупреждения о самоатаке. */
pref("devtools.selfxss.count", 5);
'''

# Замены в установщике Windows: ключ NSIS -> наш адрес.
NSIS_URLS = {
    "URLInfoAbout": REPO,
    "URLUpdateInfo": f"{REPO}/releases",
    "HelpLink": f"{REPO}/issues",
    "URLManualDownload": f"{REPO}/releases",
    "URLSystemRequirements": f"{REPO}#требования",
    # Stub-установщик в сборку не входит (configs/windows/mozconfig), но
    # если его включат, он не должен молча качать Firefox с серверов Mozilla.
    "URLStubDownloadX86": f"{REPO}/releases",
    "URLStubDownloadAMD64": f"{REPO}/releases",
    "URLStubDownloadAArch64": f"{REPO}/releases",
}

FOREIGN = re.compile(r"zen-browser|zen_browser", re.I)

# Плитка меню «Пуск»: имя программы и цвет фона — сталь из tokens.css.
APP_NAME = "vantara"
TILE_COLOR = "#16181D"


def fix_prefs() -> int:
    path = BRANDING / "pref" / "firefox-branding.js"
    if not path.exists():
        print(f"  ПРОПУСК: нет {path.relative_to(ROOT)}")
        return 0

    before = len(FOREIGN.findall(path.read_text(encoding="utf-8")))
    path.write_text(PREFS, encoding="utf-8")
    print(f"  firefox-branding.js переписан (убрано упоминаний: {before})")
    return before


def fix_nsis() -> int:
    path = BRANDING / "branding.nsi"
    if not path.exists():
        print(f"  ПРОПУСК: нет {path.relative_to(ROOT)}")
        return 0

    text = path.read_text(encoding="utf-8")
    before = len(FOREIGN.findall(text))

    for key, url in NSIS_URLS.items():
        # !define КЛЮЧ "значение" — выравнивание пробелами сохраняем как есть
        text = re.sub(
            rf'(!define\s+{key}\s+)"[^"]*"',
            lambda m: f'{m.group(1)}"{url}"',
            text,
        )

    path.write_text(text, encoding="utf-8")
    after = len(FOREIGN.findall(text))
    print(f"  branding.nsi поправлен (убрано упоминаний: {before - after})")
    return before - after


def fix_vendor() -> None:
    """Убирает MOZ_APP_VENDOR из configure.sh брендинга.

    Задать вендора здесь нельзя: configure принимает это значение только
    как производное и падает с «can not be set by confvars». Ни mozconfig,
    ни брендинг его не перекрывают — оно вшито прямо в исходники Firefox,
    в browser/moz.configure, и меняется патчем (см. patches/).

    Строка появляется, если её добавили по ошибке; функция её снимает,
    чтобы сборка не падала.
    """
    path = BRANDING / "configure.sh"
    if not path.exists():
        print(f"  ПРОПУСК: нет {path.relative_to(ROOT)}")
        return

    text = path.read_text(encoding="utf-8")
    if "MOZ_APP_VENDOR" not in text:
        return

    text = re.sub(r'^MOZ_APP_VENDOR=.*\n?', '', text, flags=re.M)
    path.write_text(text, encoding="utf-8")
    print("  configure.sh: убран MOZ_APP_VENDOR (здесь он недопустим)")


def scan_rest() -> list[str]:
    """Ищет чужие адреса, оставшиеся где-то ещё в каталоге брендинга."""
    leftovers = []
    for path in BRANDING.rglob("*"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue          # двоичные файлы пропускаем
        for number, line in enumerate(text.splitlines(), 1):
            if FOREIGN.search(line):
                leftovers.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()[:80]}")
    return leftovers


def fix_tile() -> None:
    """Плитка меню «Пуск». Windows ищет <имя программы>.VisualElementsManifest.xml
    рядом с программой; шаблон Firefox называется firefox.* и был бы
    пропущен (имя в сборке задаёт патч branding-common.mozbuild)."""
    source = BRANDING / "firefox.VisualElementsManifest.xml"
    if not source.exists():
        print(f"  ПРОПУСК: нет {source.relative_to(ROOT)}")
        return
    text = re.sub(r"BackgroundColor='#[0-9a-fA-F]{6}'",
                  f"BackgroundColor='{TILE_COLOR}'", source.read_text(encoding="utf-8"))
    (BRANDING / f"{APP_NAME}.VisualElementsManifest.xml").write_text(text, encoding="utf-8")
    print(f"  {APP_NAME}.VisualElementsManifest.xml создан (фон {TILE_COLOR})")


def main() -> int:
    if not BRANDING.exists():
        print(f"Нет каталога брендинга: {BRANDING.relative_to(ROOT)}")
        print("Сначала выполните: npx surfer import")
        return 2

    print("Чистка брендинга")
    fixed = fix_prefs() + fix_nsis()
    fix_vendor()
    fix_tile()

    leftovers = scan_rest()
    print()
    if leftovers:
        print(f"Остались чужие адреса ({len(leftovers)}):")
        for line in leftovers:
            print(f"  {line}")
        return 1

    print(f"Чужих адресов не осталось (исправлено: {fixed})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

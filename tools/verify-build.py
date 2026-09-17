"""Приёмка собранного браузера.

Сборка, которая завершилась без ошибок, ещё ничего не доказывает. Брендинг
мог не примениться, телеметрия — остаться, идентификатор приложения —
совпасть с Firefox. Всё это не даёт ни одной ошибки при компиляции и
обнаруживается уже у пользователя.

Скрипт проверяет результат по фактам, а не по намерениям.

    python tools/verify-build.py

Важно: слово «Mozilla» внутри сборки — норма и требование лицензии. Gecko
написан Mozilla, и уведомления об авторстве обязаны остаться. Проверяется
другое: чем браузер представляется системе и пользователю.
"""

from __future__ import annotations

import configparser
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "engine" / "obj-x86_64-pc-windows-msvc" / "dist" / "bin"

GREEN, RED, YELLOW, DIM, RESET = (
    "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m")

EXPECTED_VENDOR = "Vantara"
EXPECTED_NAME = "vantara"
FIREFOX_APP_ID = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"

# Файлы, которых в сборке быть не должно: это подсистемы сбора данных,
# отключённые на этапе компиляции.
FORBIDDEN_FILES = [
    "crashreporter.exe",
    "minidump-analyzer.exe",
    # Ежедневная задача в планировщике Windows с отчётом Mozilla о браузере
    # по умолчанию (configs/windows/mozconfig).
    "default-browser-agent.exe",
    # Служба Windows с правами SYSTEM для тихих обновлений Mozilla.
    "maintenanceservice.exe",
    "maintenanceservice_installer.exe",
    # Отправщик пингов телеметрии: без телеметрии ему нечего отправлять.
    "pingsender.exe",
]

# Ключевые обещания продукта. Если хоть одного нет в заводских настройках,
# установленный браузер их не выполняет, как бы ни выглядел интерфейс.
# Категории защиты и настроек под её управлением здесь нет намеренно: их
# выставляет ui/scripts/vantara-protection.js на новом профиле, а
# проверяет tools/verify-prefs.py в живом браузере.
REQUIRED_PREFS = [
    ("dom.security.https_only_mode", "true"),
    ("datareporting.healthreport.uploadEnabled", "false"),
    ("app.normandy.enabled", "false"),
    ("browser.preonboarding.enabled", "false"),
    ("media.peerconnection.ice.default_address_only", "true"),
]

results: list[tuple[bool, str, str]] = []


def check(ok: bool, title: str, detail: str = "") -> None:
    results.append((ok, title, detail))


def main() -> int:
    if not DIST.exists():
        print(f"{RED}Сборки нет: {DIST.relative_to(ROOT)}{RESET}")
        print("Сначала: .\\tools\\mach.ps1 build")
        return 2

    # --- Исполняемый файл ---------------------------------------------------
    exe = DIST / "vantara.exe"
    check(exe.exists(), "vantara.exe собран",
          f"{exe.stat().st_size / 1024 / 1024:.1f} МБ" if exe.exists() else "нет файла")

    # Сам по себе vantara.exe — небольшой лаунчер, он появляется задолго до
    # конца сборки. Движок лежит в xul.dll, и её отсутствие означает, что
    # линковка ещё не прошла: считать такую сборку готовой нельзя.
    xul = DIST / "xul.dll"
    check(xul.exists(), "xul.dll слинкована",
          f"{xul.stat().st_size / 1024 / 1024:.0f} МБ" if xul.exists()
          else "линковка не завершена")

    # Имя важно само по себе: firefox.exe означает, что --with-app-name
    # не применился, и продукт остался Firefox под другой обложкой.
    check(not (DIST / "firefox.exe").exists(),
          "firefox.exe отсутствует",
          "иначе имя приложения не применилось")

    # --- Идентификация приложения -------------------------------------------
    app_ini = DIST / "application.ini"
    if app_ini.exists():
        parser = configparser.ConfigParser()
        parser.read(app_ini, encoding="utf-8")
        app = parser["App"] if parser.has_section("App") else {}

        vendor = app.get("Vendor", "")
        name = app.get("Name", "")
        app_id = app.get("ID", "")

        check(vendor == EXPECTED_VENDOR, "Вендор — Vantara",
              f"получено: {vendor or 'пусто'}")
        check(name == EXPECTED_NAME, "Имя приложения — vantara",
              f"получено: {name or 'пусто'}")
        check(app_id != FIREFOX_APP_ID and bool(app_id),
              "Идентификатор отличается от Firefox",
              f"получено: {app_id or 'пусто'}")

        # BrowserGlue — центральный компонент старта — регистрируется только
        # для перечисленных ID приложений. Смени ID и забудь дописать его
        # сюда — браузер откроется и будет грузить сайты, но без акторов
        # окна, без восстановления сессии и со сломанными встроенными
        # расширениями. Ни одной ошибки сборки при этом не будет.
        components = DIST / "browser" / "components" / "BrowserComponents.manifest"
        if components.exists() and app_id:
            glue = [l for l in components.read_text(encoding="utf-8").splitlines()
                    if "nsBrowserGlue" in l and l.startswith("category app-startup")]
            registered = any(f"application={app_id}" in l for l in glue)
            check(registered, "BrowserGlue запускается для этого ID",
                  "" if registered else f"{app_id} нет в BrowserComponents.manifest")
    else:
        check(False, "application.ini на месте", "файла нет")

    # --- Подсистемы сбора данных --------------------------------------------
    # Упакованная сборка (dist/vantara) — то, что попадает в установщик.
    packaged = DIST.parent / EXPECTED_NAME
    for name in FORBIDDEN_FILES:
        found = [d for d in (DIST, packaged) if (d / name).exists()]
        check(not found, f"{name} не собран",
              "найден в " + ", ".join(str(d.relative_to(ROOT)) for d in found)
              if found else "подсистема отключена при компиляции")

    # --- Настройки по умолчанию ---------------------------------------------
    # Без vantara.js браузер у пользователя работает на настройках Firefox:
    # телеметрия вырезана компиляцией, но строгая защита от слежки,
    # HTTPS-only и изоляция кук остаются только в профиле разработчика.
    prefs_dir = DIST / "browser" / "defaults" / "preferences"
    prefs = prefs_dir / "00-vantara.js"
    check(prefs.exists(), "Заводские настройки Vantara в сборке",
          prefs.name if prefs.exists() else "нет 00-vantara.js — работают настройки Firefox")

    # Наличие файла ничего не гарантирует. Движок читает файлы настроек
    # в обратном алфавитном порядке, и при совпадении побеждает прочитанный
    # последним — то есть алфавитно первый. Если первым окажется чужой файл,
    # он перекроет наши значения молча.
    if prefs_dir.exists():
        names = sorted(p.name for p in prefs_dir.glob("*.js"))
        first = names[0] if names else ""
        check(first == prefs.name, "Наши настройки читаются последними",
              "" if first == prefs.name
              else f"последним читается {first}, он перекроет наши значения")

    if prefs.exists():
        text = prefs.read_text(encoding="utf-8", errors="ignore")
        for pref, value in REQUIRED_PREFS:
            present = f'pref("{pref}", {value});' in text
            check(present, f"{pref} = {value}",
                  "" if present else "значение не найдено в заводских настройках")

    # --- Сервер обновлений ---------------------------------------------------
    # Проверка обновлений сообщает владельцу сервера о каждом запуске
    # браузера. Унаследованный адрес Mozilla означает отчёт ей о наших
    # пользователях.
    if app_ini.exists():
        raw = app_ini.read_text(encoding="utf-8", errors="ignore")
        mozilla_update = "aus5.mozilla.org" in raw or "mozilla.org/updates" in raw
        check(not mozilla_update, "Обновления не ведут к Mozilla",
              "найден aus5.mozilla.org" if mozilla_update else "")

    # --- Установщик ----------------------------------------------------------
    # Stub-установщик Firefox качает браузер с download.mozilla.org и
    # проверяет подпись Mozilla: под нашим брендом он поставил бы Firefox.
    packages = DIST.parent
    stubs = sorted(p.name for p in packages.glob("*installer-stub*"))
    check(not stubs, "Нет stub-установщика, качающего Firefox",
          ", ".join(stubs) + " — удалить и пересобрать без MOZ_STUB_INSTALLER"
          if stubs else "")
    nsis = ROOT / "engine" / "browser" / "branding" / "stable" / "branding.nsi"
    if nsis.exists():
        mozilla_download = "download.mozilla.org" in nsis.read_text(encoding="utf-8")
        check(not mozilla_download, "Установщик не ссылается на загрузки Mozilla",
              "download.mozilla.org в branding.nsi — tools/fix-branding.py"
              if mozilla_download else "")

    # --- Плитка меню «Пуск» ---------------------------------------------------
    # Windows ищет <имя программы>.VisualElementsManifest.xml рядом с ней.
    if packaged.exists():
        tile = packaged / f"{EXPECTED_NAME}.VisualElementsManifest.xml"
        check(tile.exists(), "Плитка меню «Пуск» названа по программе",
              "" if tile.exists() else f"нет {tile.name} в упакованной сборке")

    # --- Языки ---------------------------------------------------------------
    # Переводы без res/multilocale.txt лежат в сборке, но не используются.
    l10n = ROOT / ".l10n"
    if l10n.exists():
        wanted = sorted(p.name for p in l10n.iterdir()
                        if p.is_dir() and not p.name.startswith("."))
        listed = (DIST / "res" / "multilocale.txt").read_text(
            encoding="utf-8").strip().split(",")
        missing = [loc for loc in wanted if loc not in listed]
        check(not missing, f"Языки интерфейса: {', '.join(listed)}",
              f"нет {', '.join(missing)} — mach package-multi-locale"
              if missing else "")

    # --- Чужой брендинг ------------------------------------------------------
    foreign = []
    for path in DIST.rglob("*.js"):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "zen-browser" in text.lower():
            foreign.append(path.relative_to(DIST))
    check(not foreign, "Нет следов zen-browser",
          f"найдено в {len(foreign)} файлах" if foreign else "")

    # --- Вывод ---------------------------------------------------------------
    print(f"{DIM}Сборка: {DIST.relative_to(ROOT)}{RESET}\n")

    failed = 0
    for ok, title, detail in results:
        mark = f"{GREEN}OK {RESET}" if ok else f"{RED}НЕТ{RESET}"
        failed += not ok
        line = f"  [{mark}] {title}"
        if detail:
            line += f"{DIM}  — {detail}{RESET}"
        print(line)

    print()
    if failed:
        print(f"{RED}Не выполнено проверок: {failed}{RESET}")
        return 1

    print(f"{GREEN}Сборка соответствует заявленному{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

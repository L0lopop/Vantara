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
]

# Ключевые обещания продукта. Если хоть одного нет в заводских настройках,
# установленный браузер их не выполняет, как бы ни выглядел интерфейс.
REQUIRED_PREFS = [
    ("browser.contentblocking.category", '"strict"'),
    ("network.cookie.cookieBehavior", "5"),
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
    else:
        check(False, "application.ini на месте", "файла нет")

    # --- Подсистемы сбора данных --------------------------------------------
    for name in FORBIDDEN_FILES:
        check(not (DIST / name).exists(), f"{name} не собран",
              "подсистема отключена при компиляции")

    # --- Настройки по умолчанию ---------------------------------------------
    # Без vantara.js браузер у пользователя работает на настройках Firefox:
    # телеметрия вырезана компиляцией, но строгая защита от слежки,
    # HTTPS-only и изоляция кук остаются только в профиле разработчика.
    prefs = DIST / "browser" / "defaults" / "preferences" / "vantara.js"
    check(prefs.exists(), "Заводские настройки Vantara в сборке",
          "vantara.js" if prefs.exists() else "нет vantara.js — работают настройки Firefox")

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

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
EXPECTED_NAME = "Vantara"
FIREFOX_APP_ID = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"

# Файлы, которых в сборке быть не должно: это подсистемы сбора данных,
# отключённые на этапе компиляции.
FORBIDDEN_FILES = [
    "crashreporter.exe",
    "minidump-analyzer.exe",
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
        check(name == EXPECTED_NAME, "Имя приложения — Vantara",
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
    prefs = DIST / "browser" / "defaults" / "preferences" / "vantara.js"
    legacy = DIST / "browser" / "defaults" / "preferences" / "firefox.js"
    check(prefs.exists() or legacy.exists(), "Файл заводских настроек на месте",
          str((prefs if prefs.exists() else legacy).name)
          if (prefs.exists() or legacy.exists()) else "не найден")

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

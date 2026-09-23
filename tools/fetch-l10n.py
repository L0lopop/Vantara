"""Скачивает переводы Firefox для сборки Vantara на других языках.

Переводы Firefox живут не в исходниках движка, а в отдельном репозитории
mozilla-l10n/firefox-l10n. Ревизию для каждого языка Firefox закрепляет
в browser/locales/l10n-changesets.json — берём ровно её, иначе строки
разойдутся с интерфейсом этой версии: новых не будет, старые останутся.

Качается только папка нужного языка (частичный клон без истории),
примерно 10–20 МБ на язык. Результат — каталог .l10n/, его путь передаётся
сборке как --with-l10n-base (см. docs/BUILD.md, «Локализация»).

    python tools/fetch-l10n.py          # русский
    python tools/fetch-l10n.py ru uk    # несколько языков
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
CHANGESETS = ENGINE / "browser" / "locales" / "l10n-changesets.json"
L10N_BASE = ROOT / ".l10n"
REPO = "https://github.com/mozilla-l10n/firefox-l10n.git"

# Ошибки перевода, которые видны в интерфейсе Vantara. Правятся поверх
# скачанных файлов при каждом запуске; если строку исправили и у Mozilla,
# скрипт об этом скажет, и правку можно убрать.
CORRECTIONS: dict[str, dict[str, list[tuple[str, str]]]] = {
    "ru": {
        # Заголовок панели открытых вкладок: «Open tabs» переведено как
        # «из открытых вкладок» — со строчной буквы и не тем смыслом.
        "browser/browser/sidebar.ftl": [
            ("    .heading = из открытых вкладок", "    .heading = Открытые вкладки"),
            ("sidebar-opentabs-title = из открытых вкладок",
             "sidebar-opentabs-title = Открытые вкладки"),
        ],
    },
}


def git(*args: str) -> str:
    result = subprocess.run(["git", "-C", str(L10N_BASE), *args],
                            capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)}:\n{result.stderr.strip()}")
    return result.stdout.strip()


def main(locales: list[str]) -> int:
    if not CHANGESETS.exists():
        print(f"Нет исходников движка: {CHANGESETS.relative_to(ROOT)}")
        return 2

    changesets = json.loads(CHANGESETS.read_text(encoding="utf-8"))
    unknown = [loc for loc in locales if loc not in changesets]
    if unknown:
        print(f"Firefox этой версии не знает языков: {', '.join(unknown)}")
        return 2

    # Все языки одной версии Firefox закреплены на одной ревизии
    # общего репозитория.
    revisions = {changesets[loc]["revision"] for loc in locales}
    if len(revisions) != 1:
        print(f"У языков разные ревизии: {revisions}")
        return 2
    revision = revisions.pop()

    L10N_BASE.mkdir(exist_ok=True)
    if not (L10N_BASE / ".git").exists():
        git("init", "-q")
        git("remote", "add", "origin", REPO)

    git("sparse-checkout", "set", *locales)
    # Прежние правки из CORRECTIONS снимаются: переход на другую ревизию
    # с изменёнными файлами git не выполнит, а правки наложатся заново.
    if current_revision():
        git("reset", "-q", "--hard")

    if current_revision() != revision:
        print(f"Загрузка переводов {', '.join(locales)} @ {revision[:12]}")
        # Без истории и без содержимого файлов: файлы нужных папок
        # докачиваются при checkout, остальные языки не качаются вовсе.
        git("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", revision)
    git("checkout", "-q", "--detach", revision)

    for loc in locales:
        files = sum(1 for _ in (L10N_BASE / loc).rglob("*.ftl"))
        print(f"  {loc}: файлов .ftl {files}")
        apply_corrections(loc)

    print(f"Готово: {L10N_BASE}")
    return 0


def apply_corrections(loc: str) -> None:
    for name, pairs in CORRECTIONS.get(loc, {}).items():
        path = L10N_BASE / loc / name
        if not path.exists():
            print(f"  {loc}/{name}: файла нет, правка не нужна")
            continue
        text = path.read_text(encoding="utf-8")
        done = 0
        for wrong, right in pairs:
            if wrong in text:
                text = text.replace(wrong, right)
                done += 1
            else:
                print(f"  {loc}/{name}: не найдено «{wrong.strip()}» — возможно, уже исправлено")
        path.write_text(text, encoding="utf-8")
        print(f"  {loc}/{name}: исправлено строк {done}")


def current_revision() -> str:
    """Ревизия, на которой стоит .l10n, или пустая строка до первой загрузки."""
    result = subprocess.run(["git", "-C", str(L10N_BASE), "rev-parse", "-q", "--verify", "HEAD"],
                            capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else ""


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["ru"]))

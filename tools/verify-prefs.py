"""Проверка того, что заводские настройки действительно действуют.

Проверка «строка есть в файле» ничего не доказывает. В собранном браузере
четверть наших настроек не применялась: движок читает файлы настроек в
обратном алфавитном порядке, и firefox.js молча затирал наш файл. Текст при
этом был на месте, приёмка сборки — зелёной.

Этот скрипт спрашивает у живого браузера, какие значения у него сейчас,
и сравнивает с ui/prefs/user.js.

Профиль должен быть пустым — иначе проверяться будет он, а не сборка.
Одно исключение, и оно обязательно: Marionette при старте сессии сам
применяет «рекомендованные настройки» для автотестов — выключает Safe
Browsing и защиту от слежки, ставит стартовой about:blank
(remote/shared/RecommendedPreferences.sys.mjs). Без запрета проверка
покажет поломку, которой в сборке нет. Скрипт готовит такой профиль сам:

    python tools/verify-prefs.py --prepare <каталог профиля>
    vantara.exe --marionette -remote-allow-system-access --profile <каталог>
    python tools/verify-prefs.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from marionette import Marionette  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "ui" / "prefs" / "user.js"
# Секция прототипа в сборку не переносится — её и не проверяем.
PROTOTYPE_ONLY = "== 11. Прототипирование"

GREEN, RED, DIM, RESET = "\033[32m", "\033[31m", "\033[2m", "\033[0m"

PROBE = """
const out = {};
for (const name of arguments[0]) {
  const type = Services.prefs.getPrefType(name);
  try {
    if (type == Services.prefs.PREF_BOOL) {
      out[name] = String(Services.prefs.getBoolPref(name));
    } else if (type == Services.prefs.PREF_INT) {
      out[name] = String(Services.prefs.getIntPref(name));
    } else if (type == Services.prefs.PREF_STRING) {
      out[name] = JSON.stringify(Services.prefs.getStringPref(name));
    } else {
      out[name] = "(не задана)";
    }
  } catch (e) {
    out[name] = "(ошибка чтения)";
  }
}
return out;
"""


def expected() -> dict[str, str]:
    text = SOURCE.read_text(encoding="utf-8")
    cut = text.find(PROTOTYPE_ONLY)
    if cut != -1:
        text = text[:cut]
    return {m.group(1): m.group(2).strip()
            for m in re.finditer(r'^user_pref\("([^"]+)",\s*(.+?)\);', text, re.M)}


# Единственная строка в профиле проверки. Она относится к Marionette,
# а не к браузеру, и ни одну проверяемую настройку не задаёт.
PROFILE_USER_JS = 'user_pref("remote.prefs.recommended", false);\n'


def prepare(profile: Path) -> int:
    """Создаёт пустой профиль, пригодный для проверки."""
    if profile.exists() and any(profile.iterdir()):
        print(f"{RED}Каталог не пуст: {profile}{RESET}")
        print(f"{DIM}Проверка на обжитом профиле проверяет профиль, а не сборку.{RESET}")
        return 2
    profile.mkdir(parents=True, exist_ok=True)
    (profile / "user.js").write_text(PROFILE_USER_JS, encoding="utf-8")
    print(f"Профиль для проверки готов: {profile}")
    return 0


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--prepare":
        return prepare(Path(sys.argv[2]))

    want = expected()

    try:
        with Marionette(timeout=60) as m:
            live = m.script(PROBE, [list(want)])
            strict_applied = m.script("""
              const { ContentBlockingPrefs } = ChromeUtils.importESModule(
                "moz-src:///browser/components/protections/ContentBlockingPrefs.sys.mjs");
              return ContentBlockingPrefs.prefsMatch("strict");
            """)
    except (ConnectionError, OSError) as exc:
        print(f"{RED}Нет связи с браузером (127.0.0.1:2828){RESET}")
        print(f"{DIM}  {exc}{RESET}")
        return 2

    wrong = [(name, value, live.get(name)) for name, value in want.items()
             if live.get(name) != value]

    print(f"Настроек профиля: {len(want)}, действуют: {len(want) - len(wrong)}")
    for name, value, got in wrong:
        print(f"  {RED}НЕТ{RESET} {name}")
        print(f"{DIM}      ожидалось {value}, в браузере {got}{RESET}")

    # Метка категории ещё не значит, что набор применён. Спрашиваем модуль
    # защиты: совпадают ли все его настройки со строгим определением.
    print()
    if not strict_applied:
        wrong.append(("строгий набор", "применён", "нет"))
        print(f"  {RED}НЕТ{RESET} строгий набор защиты применён не целиком")
    else:
        print(f"  {GREEN}OK {RESET} строгий набор защиты применён целиком")

    print()
    if wrong:
        print(f"{RED}Не действует настроек: {len(wrong)}{RESET}")
        print(f"{DIM}Если профиль не пустой, проверяется он, а не сборка.{RESET}")
        return 1

    print(f"{GREEN}Все заводские настройки действуют{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

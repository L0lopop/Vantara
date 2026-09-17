"""Снимки интерфейса для README.

Готовит тестовое окно так, как его видит человек после пары дней работы:
посещённые сайты, избранное, группы вкладок, — и снимает его через
Marionette. Кадр рисует сам браузер, поэтому в него не попадают рабочий
стол, чужие окна и курсор.

    .\\tools\\run-build.ps1 -Packaged
    python tools/readme-shots.py
    .\\tools\\run-build.ps1 -Packaged -Locale en-US
    python tools/readme-shots.py

Язык снимков берётся из браузера: русские ложатся в docs/screenshots/readme/,
английские — туда же с суффиксом -en.

Сайты открываются по-настоящему: значки на полке «Недавно посещённые»
берутся из истории. Значок Marionette в адресной строке на время снимков
убирается — без Marionette его нет, как и в браузере для работы.
"""

from __future__ import annotations

import base64
import io
import json
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from marionette import Marionette  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots" / "readme"

WINDOW = {"x": 40, "y": 40, "width": 1280, "height": 800}
# Полоса вкладок для анимации: уже окна, чтобы картинка шла в README
# без уменьшения.
STRIP_WIDTH = 900

SITES = [
    "https://www.wikipedia.org/",
    "https://github.com/",
    "https://habr.com/",
    "https://stackoverflow.com/",
    "https://www.openstreetmap.org/",
    "https://duckduckgo.com/",
]

TEXT = {
    "ru": {
        "favorites": [
            ("https://github.com/", "GitHub"),
            ("https://www.wikipedia.org/", "Википедия"),
            ("https://habr.com/", "Хабр"),
        ],
        "groups": [("Работа", "blue"), ("Чтение", "orange")],
    },
    "en": {
        "favorites": [
            ("https://github.com/", "GitHub"),
            ("https://www.wikipedia.org/", "Wikipedia"),
            ("https://habr.com/", "Habr"),
        ],
        "groups": [("Work", "blue"), ("Reading", "orange")],
    },
}

# Вкладки на главном экране и в группах — по имени узла.
HOME_TABS = ["www.wikipedia.org", "github.com", "habr.com"]
GROUP_TABS = ["www.wikipedia.org", "github.com", "habr.com",
              "stackoverflow.com", "www.openstreetmap.org"]
GROUPS = [["github.com", "stackoverflow.com"],
          ["www.wikipedia.org", "habr.com"]]

FPS = 30
SLOWDOWN = 2
MODULE = "chrome://browser/content/vantara/modules/VantaraNewTab.sys.mjs"

# --- Код для окна браузера -------------------------------------------------

PREPARE = """
window.windowUtils.disableNonTestMouseEvents(true);
document.documentElement.removeAttribute("remotecontrol");
return Services.locale.appLocaleAsBCP47;
"""

VISIT = """
const [urls] = arguments;
const done = arguments[arguments.length - 1];
const tabs = urls.map(url => gBrowser.addWebTab(url, { skipAnimation: true }));
const deadline = Date.now() + 45000;
const ready = tab => {
  const uri = tab.linkedBrowser.currentURI;
  return /^https?$/.test(uri.scheme) && !tab.hasAttribute("busy") &&
         (tab.image || Date.now() > deadline);
};
(function wait() {
  if (tabs.every(ready) || Date.now() > deadline + 5000) {
    // Значок сохраняется в историю не сразу после загрузки.
    setTimeout(() => done(tabs.map(t => [t.linkedBrowser.currentURI.spec, !!t.image])), 3000);
  } else {
    setTimeout(wait, 500);
  }
})();
"""

RECENT = f"""
const done = arguments[arguments.length - 1];
const {{ VantaraNewTab }} = ChromeUtils.importESModule("{MODULE}");
VantaraNewTab.recentSites().then(list => done(list.map(s => [s.host, s.icon.length])));
"""

# Оставляет вкладки с перечисленными узлами в заданном порядке и, если
# нужно, новую вкладку в конце. Остальные закрываются.
ARRANGE = f"""
const [hosts, newtab, palette, mode] = arguments;
const done = arguments[arguments.length - 1];
(async () => {{
  const {{ VantaraNewTab }} = ChromeUtils.importESModule("{MODULE}");
  await VantaraNewTab.setTheme({{ palette, mode }});
  for (const group of [...gBrowser.tabGroups]) group.ungroupTabs();
  const host = tab => {{ try {{ return tab.linkedBrowser.currentURI.host; }} catch {{ return ""; }} }};
  const keep = [];
  for (const name of hosts) {{
    const tab = [...gBrowser.tabs].find(t => host(t) === name && !keep.includes(t));
    keep.push(tab ?? gBrowser.addWebTab("https://" + name + "/", {{ skipAnimation: true }}));
  }}
  let selected = keep[0];
  if (newtab) {{
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    selected = gBrowser.addTab("about:newtab", {{ triggeringPrincipal: principal, skipAnimation: true }});
    keep.push(selected);
  }}
  gBrowser.selectedTab = selected;
  for (const tab of [...gBrowser.tabs]) {{
    if (!keep.includes(tab)) gBrowser.removeTab(tab, {{ animate: false }});
  }}
  keep.forEach((tab, index) => gBrowser.moveTabTo(tab, {{ tabIndex: index }}));
  document.documentElement.removeAttribute("remotecontrol");
  setTimeout(() => done(keep.length), 2500);
}})();
"""

# Marionette не видит вкладок Vantara (он узнаёт Firefox по ID приложения),
# поэтому код для страницы выполняется скриптом вкладки.
IN_PAGE = """
const [code] = arguments;
const done = arguments[arguments.length - 1];
const mm = gBrowser.selectedBrowser.messageManager;
const listener = message => {
  mm.removeMessageListener("VantaraShots:Done", listener);
  done(message.data);
};
mm.addMessageListener("VantaraShots:Done", listener);
mm.loadFrameScript("data:," + encodeURIComponent(`
  let result = true;
  try { (${code})(content.document); } catch (e) { result = String(e); }
  sendAsyncMessage("VantaraShots:Done", result);`), false);
"""

FAVORITES = """
Services.prefs.setStringPref("vantara.newtab.tiles", arguments[0]);
Services.prefs.clearUserPref("vantara.newtab.engine");
return 1;
"""

# Панель группы — отдельное окно, и снимок средствами браузера её не
# захватывает: такую панель снимаем с экрана и обрезаем по окну.
WINDOW_RECT = """
const dpr = window.devicePixelRatio;
return [window.screenX, window.screenY, window.outerWidth, window.outerHeight, dpr];
"""

OPEN_PANEL = """
const group = gBrowser.tabGroups[0];
gBrowser.selectedTab = group.tabs[0];
gBrowser.tabGroupMenu.openEditModal(group);
document.documentElement.removeAttribute("remotecontrol");
return 1;
"""

# Создаёт группу и останавливает её анимацию на нуле: кадры потом
# выставляются вручную, и скорость снимков не влияет на результат.
GROUP = """
const [hosts, label, color] = arguments;
const host = tab => { try { return tab.linkedBrowser.currentURI.host; } catch { return ""; } };
const tabs = hosts.map(name => [...gBrowser.tabs].find(t => host(t) === name));
gVantaraGroups.MERGE_MS = 600000;
const group = gBrowser.addTabGroup(tabs, { label, color, insertBefore: tabs[0] });
// Только анимации слияния: у вкладок бывают и свои, бесконечные.
const ours = a => a instanceof CSSAnimation
  ? a.animationName.startsWith("vn-group")
  : !(a instanceof CSSTransition);
const animations = [...new Set([group, ...tabs].flatMap(
  el => el.getAnimations({ subtree: true })))].filter(ours);
animations.forEach(a => a.pause());
window.__shotAnimations = animations;
return Math.max(0, ...animations.map(a => {
  const t = a.effect.getComputedTiming();
  return t.delay + t.activeDuration;
}));
"""

SEEK = """
const [time] = arguments;
for (const a of window.__shotAnimations) a.currentTime = time;
return 1;
"""

UNFREEZE = """
for (const a of window.__shotAnimations ?? []) a.finish();
window.__shotAnimations = [];
for (const group of gBrowser.tabGroups) group.removeAttribute("vn-merging");
gVantaraGroups.MERGE_MS = 520;
document.documentElement.removeAttribute("remotecontrol");
return 1;
"""


# --- Снимки ------------------------------------------------------------------

def unwrap(value):
    if isinstance(value, dict) and set(value) == {"value"}:
        return value["value"]
    return value


def run_async(m: Marionette, script: str, args: list | None = None):
    return unwrap(m.command("WebDriver:ExecuteAsyncScript",
                            {"script": script, "args": args or []}))


STRIP_RECT = """
const r = document.getElementById("TabsToolbar").getBoundingClientRect();
return [r.left, r.top, r.right, r.bottom].map(v => Math.round(v * devicePixelRatio));
"""


def capture(m: Marionette, box: list[int] | None = None) -> Image.Image:
    data = unwrap(m.command("WebDriver:TakeScreenshot", {"full": False}))
    image = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
    return image.crop(tuple(box)) if box else image


def screen_capture(m: Marionette) -> Image.Image:
    """Снимок окна с экрана — вместе со всплывающими панелями."""
    raw = OUT / ".screen.png"
    subprocess.run(
        ["powershell", "-NoProfile", "-File", str(ROOT / "tools" / "screenshot.ps1"),
         "-Process", "vantara", "-PathPrefix", str(ROOT / "engine"),
         "-Out", str(raw), "-Delay", "1", "-FullScreen"],
        check=True, capture_output=True)
    x, y, width, height, dpr = m.script(WINDOW_RECT)
    # У окна Windows невидимая рамка: она попадает в размеры, но не рисуется.
    edge = 8
    box = [round((x + edge) * dpr), round(y * dpr),
           round((x + width - edge) * dpr), round((y + height - edge) * dpr)]
    image = Image.open(raw).convert("RGB").crop(tuple(box))
    raw.unlink()
    return image


def save(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {image.width}x{image.height}")


def in_page(m: Marionette, code: str) -> None:
    """Выполняет функцию от document на странице выбранной вкладки."""
    result = run_async(m, IN_PAGE, [code])
    if result is not True:
        raise RuntimeError(f"Ошибка на странице: {result}")


# Снимок средствами браузера пропускает на странице вкладки элементы с
# opacity меньше единицы (на экране они есть). filter: opacity() рисуется
# так же и в снимок попадает.
OPACITY_FIX = """doc => {
    for (const el of doc.querySelectorAll('*')) {
        const style = doc.defaultView.getComputedStyle(el);
        const value = parseFloat(style.opacity);
        if (value > 0 && value < 1) {
            const filter = style.filter === 'none' ? '' : style.filter + ' ';
            el.style.transition = 'none';
            el.style.opacity = '1';
            el.style.filter = filter + 'opacity(' + value + ')';
        }
    }
}"""


def home(m: Marionette, palette: str, mode: str) -> None:
    run_async(m, ARRANGE, [HOME_TABS, True, palette, mode])
    in_page(m, OPACITY_FIX)
    time.sleep(0.3)


def merge_animation(m: Marionette, groups: list, suffix: str) -> None:
    """Слияние вкладок в две группы, кадр за кадром."""
    m.command("WebDriver:SetWindowRect", {**WINDOW, "width": STRIP_WIDTH})
    run_async(m, ARRANGE, [GROUP_TABS, False, "forge", "dark"])
    strip = m.script(STRIP_RECT)

    step = 1000 / FPS / SLOWDOWN
    frames: list[tuple[Image.Image, int]] = [(capture(m, strip), 900)]
    for (label, color), hosts in zip(groups, GROUPS):
        length = m.script(GROUP, [hosts, label, color])
        t = 0.0
        while t <= length + step:
            m.script(SEEK, [t])
            frames.append((capture(m, strip), round(1000 / FPS)))
            t += step
        m.script(UNFREEZE)
        frames[-1] = (frames[-1][0], 800)
    frames[-1] = (frames[-1][0], 2200)

    images = [f.quantize(colors=255, method=Image.Quantize.MEDIANCUT,
                         dither=Image.Dither.NONE) for f, _ in frames]
    path = OUT / f"tab-groups-merge{suffix}.gif"
    images[0].save(path, save_all=True, append_images=images[1:],
                   duration=[d for _, d in frames], loop=0, optimize=True,
                   disposal=1)
    print(f"  {path.relative_to(ROOT)}  {len(images)} кадров")
    m.command("WebDriver:SetWindowRect", WINDOW)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with Marionette(timeout=180) as m:
        m.command("WebDriver:SetTimeouts", {"script": 120000})
        m.command("WebDriver:SetWindowRect", WINDOW)
        locale = m.script(PREPARE)
        lang = "ru" if locale.startswith("ru") else "en"
        suffix = "" if lang == "ru" else "-en"
        text = TEXT[lang]
        print(f"Язык браузера: {locale}")

        print("Открываю сайты…")
        for url, has_icon in run_async(m, VISIT, [SITES]):
            print(f"  {'+' if has_icon else '-'} {url}")
        recent = run_async(m, RECENT)
        print("В истории:", ", ".join(f"{h}{'' if n else ' (без значка)'}"
                                      for h, n in recent))

        merge_animation(m, text["groups"], suffix)

        # Панель группы: имя, цвет, вкладки внутри и одно действие внизу.
        run_async(m, ARRANGE, [GROUP_TABS, False, "forge", "dark"])
        label, color = text["groups"][0]
        m.script(GROUP, [GROUP_TABS[:3], label, color])
        m.script(SEEK, [100000])
        m.script(UNFREEZE)
        m.script(OPEN_PANEL)
        time.sleep(1.5)
        save(screen_capture(m), f"group-panel{suffix}.png")
        m.script("""
            document.querySelector(".tab-group-editor-panel")?.hidePopup();
            return 1;""")

        # Главный экран.
        tiles = [{"url": url, "name": name} for url, name in text["favorites"]]
        m.script(FAVORITES, [json.dumps(tiles, ensure_ascii=False)])
        home(m, "forge", "dark")
        save(capture(m), f"home-dark{suffix}.png")

        home(m, "forge", "light")
        save(capture(m), f"home-light{suffix}.png")

        home(m, "forge", "dark")
        in_page(m, """doc => {
            doc.getElementById('theme-toggle').click();
            doc.querySelector('[data-palette="pine"]').click();
        }""")
        time.sleep(2)
        in_page(m, OPACITY_FIX)
        time.sleep(0.3)
        save(capture(m), f"palettes{suffix}.png")

        # Прежний вид для следующего запуска.
        home(m, "forge", "system")
    return 0


if __name__ == "__main__":
    sys.exit(main())

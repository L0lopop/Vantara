/* ==========================================================================
 * Vantara — страница новой вкладки
 *
 * Страница не делает сетевых запросов: ни шрифтов, ни рекомендаций, ни
 * значков сайтов из сети. Значки и список посещённых сайтов даёт браузер
 * из своей истории — локально.
 *
 * С браузером страница говорит через атрибуты корня и события
 * (AboutNewTabChild.sys.mjs): атрибуты несут состояние, события — просьбы
 * и ответы. В прототипе браузера за страницей нет: избранное и оформление
 * хранятся в localStorage, полки «Недавно посещённые» нет.
 * ========================================================================== */

import { resolveTarget, nameFromUrl } from './url-parse.js';
import { t, localize } from './strings.js';

const root = document.documentElement;
// Атрибуты состояния ставит браузер ещё до запуска скриптов страницы.
const fromBrowser = root.hasAttribute('vn-locale');

/* --- Хранилище ------------------------------------------------------------
 * В браузере localStorage этой странице недоступен (about:newtab), и всё,
 * что сохранено, пропадало бы вместе с вкладкой. Там данные хранит браузер:
 * присылает событием VantaraNewTab:Store и принимает просьбу SetStore.
 * ------------------------------------------------------------------------- */

const Store = {
  PREFIX: 'vantara.newtab.',
  // Последние данные браузера вместе со своими записями, ещё не
  // вернувшимися обратно.
  saved: {},

  read(key, fallback) {
    if (fromBrowser) {
      return Object.hasOwn(this.saved, key) ? this.saved[key] : fallback;
    }
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      // Приватное окно или запрет на хранилище — работаем без сохранения.
      return fallback;
    }
  },

  write(key, value) {
    if (fromBrowser) {
      this.saved[key] = value;
      ask('SetStore', { key, value });
      return true;
    }
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

/** Просьба к браузеру. Данные — строкой JSON: так их проще проверить. */
function ask(name, data) {
  root.dispatchEvent(new CustomEvent(`VantaraNewTab:${name}`, {
    bubbles: true,
    detail: data === undefined ? undefined : JSON.stringify(data),
  }));
}

/* --- Мелкие построители ---------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  // Путь к спрайту в сборке заменяется ссылкой на встроенный спрайт.
  use.setAttribute('href', '../../chrome/vantara/icons/sprite.svg#vn-' + name);
  svg.append(use);
  return svg;
}

function actionButton(titleKey, iconName, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = t(titleKey);
  button.append(icon(iconName));
  button.addEventListener('click', event => {
    // Кнопка лежит внутри ссылки: переход по ней не нужен.
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

/** Плитка сайта: значок из истории браузера или первая буква имени. */
function siteTile(url, name, iconUrl, index) {
  const link = document.createElement('a');
  link.className = 'tile';
  link.href = url;
  link.title = url;
  // Каскад: каждая следующая плитка чуть позже предыдущей.
  link.style.animationDelay = `${index * 30}ms`;

  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  if (iconUrl) {
    const img = document.createElement('img');
    img.src = iconUrl;
    img.alt = '';
    // Битый значок — не повод показывать пустое место.
    img.addEventListener('error', () => {
      img.remove();
      glyph.textContent = name.charAt(0);
    });
    glyph.append(img);
  } else {
    glyph.textContent = name.charAt(0);
  }

  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = name;

  const actions = document.createElement('span');
  actions.className = 'tile-actions';

  link.append(glyph, label, actions);
  return link;
}

/* --- Поисковые системы ----------------------------------------------------
 * Первая — система браузера (vn-search), её меняют в настройках. Остальные
 * можно выбрать кнопкой справа в строке поиска.
 * ------------------------------------------------------------------------- */

const BUILT_IN_ENGINES = [
  { id: 'google',    name: 'Google',     url: 'https://www.google.com/search?q=' },
  { id: 'ddg',       name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'startpage', name: 'Startpage',  url: 'https://www.startpage.com/sp/search?query=' },
  { id: 'brave',     name: 'Brave',      url: 'https://search.brave.com/search?q=' },
];

function engines() {
  let browser = null;
  try {
    const data = JSON.parse(root.getAttribute('vn-search'));
    if (data?.name && data?.url) {
      browser = { id: 'browser', name: data.name, url: data.url };
    }
  } catch {}
  if (!browser) {
    return BUILT_IN_ENGINES;
  }
  return [browser, ...BUILT_IN_ENGINES.filter(e => e.name !== browser.name)];
}

const engineButton = document.getElementById('engine');

function currentEngine() {
  const list = engines();
  const chosen = Store.read('engine', null);
  return list.find(e => e.id === chosen) ?? list[0];
}

function renderEngine() {
  engineButton.textContent = currentEngine().name;
}

engineButton.addEventListener('click', () => {
  // engines() каждый раз строит список заново — сравниваем по id.
  const list = engines();
  const index = list.findIndex(e => e.id === currentEngine().id);
  const next = list[(index + 1) % list.length];
  Store.write('engine', next.id);
  renderEngine();
});

/* --- Строка поиска --------------------------------------------------------
 * Разбор ввода — в url-parse.js: он решает, уйдёт ли текст в поисковую
 * систему, поэтому вынесен отдельно и покрыт тестами.
 *     node tools/test-url-parse.mjs
 * ------------------------------------------------------------------------- */

document.getElementById('search').addEventListener('submit', event => {
  event.preventDefault();
  const target = resolveTarget(document.getElementById('q').value,
                               currentEngine().url);
  if (target) location.href = target;
});

/* --- Посещённые сайты -----------------------------------------------------
 * Список присылает браузер: по одному сайту на адрес, новые первыми.
 * ------------------------------------------------------------------------- */

const historyShelf = document.getElementById('history-shelf');
const historyRoot = document.getElementById('history');
const hint = document.getElementById('hint');

let visited = [];
// Пока браузер не ответил, подсказку «здесь появятся сайты» не показываем.
let historyLoaded = !fromBrowser;

function iconFor(url) {
  try {
    const host = new URL(url).host;
    return visited.find(site => site.host === host)?.icon ?? '';
  } catch {
    return '';
  }
}

function isFavorite(url) {
  return favorites.some(tile => tile.url === url);
}

function renderHistory() {
  historyShelf.hidden = visited.length === 0;
  // Подсказка нужна, только пока показать нечего.
  hint.hidden = visited.length > 0 || !historyLoaded;
  historyRoot.textContent = '';

  visited.forEach((site, index) => {
    const tile = siteTile(site.url, nameFromUrl(site.url), site.icon, index);
    const actions = tile.querySelector('.tile-actions');
    if (!isFavorite(site.url)) {
      actions.append(actionButton('tileFavorite', 'star', () => {
        addFavorite(site.url, nameFromUrl(site.url));
      }));
    }
    actions.append(actionButton('tileForget', 'close', () => {
      visited = visited.filter(item => item !== site);
      renderHistory();
      ask('RemoveHistory', { host: site.host });
    }));
    historyRoot.append(tile);
  });
}

window.addEventListener('VantaraNewTab:History', event => {
  try {
    const list = JSON.parse(event.detail);
    visited = Array.isArray(list) ? list.filter(site =>
      typeof site?.url === 'string' && /^https?:\/\//.test(site.url)) : [];
  } catch {
    visited = [];
  }
  historyLoaded = true;
  renderHistory();
  renderFavorites();
});

/* --- Избранное -------------------------------------------------------------
 * Список ведёт пользователь: сюда попадает только то, что добавили сами.
 * ------------------------------------------------------------------------- */

const tilesRoot = document.getElementById('tiles');

let favorites = [];

function loadFavorites() {
  const list = Store.read('tiles', []);
  favorites = Array.isArray(list)
    ? list.filter(tile => typeof tile?.url === 'string')
    : [];
}

loadFavorites();

// Приходит перед списком посещённых сайтов, в той же задаче: страница
// перерисовывается один раз.
window.addEventListener('VantaraNewTab:Store', event => {
  try {
    const data = JSON.parse(event.detail);
    Store.saved = data && typeof data === 'object' ? data : {};
  } catch {
    Store.saved = {};
  }
  loadFavorites();
  renderEngine();
  renderFavorites();
});

function addFavorite(url, name) {
  if (isFavorite(url)) return;
  favorites.push({ url, name });
  Store.write('tiles', favorites);
  renderFavorites();
  renderHistory();
}

function renderFavorites() {
  tilesRoot.textContent = '';

  favorites.forEach((tile, index) => {
    const name = tile.name || nameFromUrl(tile.url);
    const link = siteTile(tile.url, name, iconFor(tile.url), index);
    link.querySelector('.tile-actions').append(actionButton('tileRemove', 'close', () => {
      favorites.splice(index, 1);
      Store.write('tiles', favorites);
      renderFavorites();
      renderHistory();
    }));
    tilesRoot.append(link);
  });

  // Кнопка добавления всегда последняя.
  const add = document.createElement('button');
  add.className = 'tile add';
  add.type = 'button';
  add.title = t('tileAdd');
  add.style.animationDelay = `${favorites.length * 30}ms`;
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.append(icon('plus'));
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = t('tileAddShort');
  add.append(glyph, label);
  add.addEventListener('click', openDialog);
  tilesRoot.append(add);
}

/* --- Диалог добавления ---------------------------------------------------- */

const dialog = document.getElementById('dialog');
const urlField = document.getElementById('tile-url');
const nameField = document.getElementById('tile-name');

function openDialog() {
  urlField.value = '';
  nameField.value = '';
  dialog.showModal();
  urlField.focus();
}

document.getElementById('cancel').addEventListener('click', () => dialog.close());

document.getElementById('tile-form').addEventListener('submit', () => {
  const raw = urlField.value.trim();
  if (!raw) return;

  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
  addFavorite(url, nameField.value.trim() || nameFromUrl(url));
});

/* --- Оформление ------------------------------------------------------------
 * Палитра меняет цвета, схема — светлую или тёмную основу. В браузере
 * выбор уходит в его настройки и сразу действует во всех окнах; в
 * прототипе — только на этой странице.
 * ------------------------------------------------------------------------- */

const themeToggle = document.getElementById('theme-toggle');
const themePopover = document.getElementById('theme-popover');

function setThemeOpen(open) {
  themePopover.hidden = !open;
  themeToggle.setAttribute('aria-expanded', String(open));
}

themeToggle.addEventListener('click', () => setThemeOpen(themePopover.hidden));

document.addEventListener('click', event => {
  if (!themePopover.hidden && !event.target.closest('.theme')) {
    setThemeOpen(false);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setThemeOpen(false);
});

function applyPalette(palette) {
  if (palette === 'forge') {
    root.removeAttribute('vn-palette');
  } else {
    root.setAttribute('vn-palette', palette);
  }
}

// В прототипе схему задаёт атрибут vn-theme; в браузере — его тема,
// и страница следует ей сама.
function applyMode(mode) {
  root.setAttribute('vn-mode', mode);
  if (fromBrowser) return;
  if (mode === 'system') {
    root.removeAttribute('vn-theme');
  } else {
    root.setAttribute('vn-theme', mode);
  }
}

function renderTheme() {
  const palette = root.getAttribute('vn-palette') || 'forge';
  const mode = root.getAttribute('vn-mode') || 'system';
  for (const button of themePopover.querySelectorAll('[data-palette]')) {
    button.setAttribute('aria-checked', String(button.dataset.palette === palette));
  }
  for (const button of themePopover.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-checked', String(button.dataset.mode === mode));
  }
}

themePopover.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.palette) {
    applyPalette(button.dataset.palette);
    if (fromBrowser) {
      ask('SetTheme', { palette: button.dataset.palette });
    } else {
      Store.write('palette', button.dataset.palette);
    }
  } else if (button.dataset.mode) {
    applyMode(button.dataset.mode);
    if (fromBrowser) {
      ask('SetTheme', { mode: button.dataset.mode });
    } else {
      Store.write('mode', button.dataset.mode);
    }
  }
  renderTheme();
});

if (!fromBrowser) {
  applyPalette(Store.read('palette', 'forge'));
  applyMode(Store.read('mode', 'dark'));
}

/* --- Изменения от браузера -------------------------------------------------
 * Новая вкладка готовится заранее, в фоне; когда её показывают, браузер
 * обновляет атрибуты и присылает свежие данные и список посещённых сайтов.
 * ------------------------------------------------------------------------- */

if (fromBrowser) {
  new MutationObserver(records => {
    const changed = new Set(records.map(r => r.attributeName));
    if (changed.has('vn-palette') || changed.has('vn-mode')) renderTheme();
    if (changed.has('vn-search')) renderEngine();
  }).observe(root, {
    attributes: true,
    attributeFilter: ['vn-palette', 'vn-mode', 'vn-search'],
  });
}

/* --- Запуск --------------------------------------------------------------- */

localize();
renderEngine();
renderHistory();
renderTheme();
if (fromBrowser) {
  // Избранное придёт от браузера: пустая полка до ответа мигала бы.
  ask('RequestData');
} else {
  renderFavorites();
}
document.getElementById('q').focus();

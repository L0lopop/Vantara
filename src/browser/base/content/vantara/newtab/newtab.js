/* ==========================================================================
 * Vantara — страница новой вкладки
 *
 * Принцип: страница не делает ни одного сетевого запроса до того, как
 * пользователь что-то ввёл или нажал. Ни фавиконок, ни шрифтов, ни
 * «рекомендаций» — иначе браузер сообщает о вашем запуске раньше, чем
 * вы успели что-либо открыть.
 *
 * Хранилище вынесено в Store: в прототипе это localStorage, в сборке форка
 * на его место встанут настройки браузера. Остальной код менять не придётся.
 * ========================================================================== */

import { resolveTarget, nameFromUrl } from 'chrome://browser/content/vantara/newtab/url-parse.js';
import { t, localize, formatNumber } from 'chrome://browser/content/vantara/newtab/strings.js';

/* --- Хранилище ------------------------------------------------------------ */

const Store = {
  PREFIX: 'vantara.newtab.',

  read(key, fallback) {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      // Приватное окно или запрет на хранилище — работаем без сохранения.
      return fallback;
    }
  },

  write(key, value) {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

/* --- Поисковые системы ----------------------------------------------------
 * Порядок значим: первым идёт тот, что не строит профиль пользователя.
 * Google в списке есть — отказ признавать его существование не делает
 * браузер приватнее, а выбор должен оставаться за пользователем.
 * ------------------------------------------------------------------------- */

const ENGINES = [
  { id: 'ddg',       name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'startpage', name: 'Startpage',  url: 'https://www.startpage.com/sp/search?query=' },
  { id: 'brave',     name: 'Brave',      url: 'https://search.brave.com/search?q=' },
  { id: 'google',    name: 'Google',     url: 'https://www.google.com/search?q=' },
];

let engineIndex = Math.max(0, ENGINES.findIndex(e => e.id === Store.read('engine', 'ddg')));

const engineButton = document.getElementById('engine');

function renderEngine() {
  engineButton.textContent = ENGINES[engineIndex].name;
}

engineButton.addEventListener('click', () => {
  engineIndex = (engineIndex + 1) % ENGINES.length;
  Store.write('engine', ENGINES[engineIndex].id);
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
                               ENGINES[engineIndex].url);
  if (target) location.href = target;
});

/* --- Закреплённые ссылки --------------------------------------------------
 * Список ведёт пользователь. «Часто посещаемые» здесь принципиально нет:
 * такой список строится из слежки за собственной историей и показывает
 * посторонним, чем вы занимались.
 * ------------------------------------------------------------------------- */

const tilesRoot = document.getElementById('tiles');
const pinnedSection = document.querySelector('.pinned');

let tiles = Store.read('tiles', []);

function renderTiles() {
  // Подсказка показывается только пока список пуст.
  const hint = pinnedSection.querySelector('.empty');
  if (tiles.length === 0 && !hint) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = t('pinnedHint');
    pinnedSection.insertBefore(p, tilesRoot);
  } else if (tiles.length > 0 && hint) {
    hint.remove();
  }

  tilesRoot.textContent = '';

  tiles.forEach((tile, index) => {
    const link = document.createElement('a');
    link.className = 'tile';
    link.href = tile.url;
    link.title = tile.url;
    // Каскад: каждая следующая плитка чуть позже предыдущей.
    link.style.animationDelay = `${index * 35}ms`;

    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = (tile.name || nameFromUrl(tile.url)).charAt(0);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = tile.name || nameFromUrl(tile.url);

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.title = t('tileRemove');
    remove.innerHTML =
      '<svg class="icon" aria-hidden="true">' +
      '<use href="#vn-close"/></svg>';
    remove.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      tiles.splice(index, 1);
      Store.write('tiles', tiles);
      renderTiles();
    });

    link.append(glyph, name, remove);
    tilesRoot.append(link);
  });

  // Кнопка добавления всегда последняя.
  const add = document.createElement('button');
  add.className = 'tile add';
  add.type = 'button';
  add.title = t('tileAdd');
  add.style.animationDelay = `${tiles.length * 35}ms`;
  add.innerHTML =
    '<span class="glyph"><svg class="icon" aria-hidden="true">' +
    '<use href="#vn-plus"/></svg></span>' +
    '<span class="name"></span>';
  add.querySelector('.name').textContent = t('tileAddShort');
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
  tiles.push({ url, name: nameField.value.trim() || nameFromUrl(url) });
  Store.write('tiles', tiles);
  renderTiles();
});

/* --- Сводка защиты --------------------------------------------------------
 * В сборке число даёт браузер: до запуска скриптов страницы он кладёт
 * итог щита (ui/scripts/vantara-shield.js) в атрибут vn-blocked, а сброс
 * принимает событием. Прочитать настройку браузера сама страница не может.
 * В прототипе браузера за страницей нет — счётчик локальный.
 * ------------------------------------------------------------------------- */

const blockedOut = document.getElementById('blocked');
const root = document.documentElement;
const fromBrowser = root.hasAttribute('vn-blocked');

function renderBlocked() {
  const total = fromBrowser
    ? Number(root.getAttribute('vn-blocked')) || 0
    : Store.read('blocked', 0);
  blockedOut.textContent = formatNumber(total);
}

// Новая вкладка готовится заранее, в фоне, и число обновляется, когда
// её показывают.
if (fromBrowser) {
  new MutationObserver(renderBlocked)
    .observe(root, { attributes: true, attributeFilter: ['vn-blocked'] });
}

document.getElementById('reset').addEventListener('click', () => {
  if (fromBrowser) {
    root.setAttribute('vn-blocked', '0');
    root.dispatchEvent(new CustomEvent('VantaraNewTab:ResetBlocked', { bubbles: true }));
  } else {
    Store.write('blocked', 0);
  }
  renderBlocked();
});

/* --- Запуск --------------------------------------------------------------- */

localize();
renderEngine();
renderTiles();
renderBlocked();
document.getElementById('q').focus();

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — ответы браузера странице новой вкладки.
 *
 * Страница работает в отдельном процессе и сама не может ни прочитать
 * историю, ни поменять тему, ни даже сохранить избранное: localStorage
 * странице about:newtab недоступен. Она шлёт событие; AboutNewTabChild
 * пересылает его сюда через AboutNewTabParent (патчи в src/browser/actors).
 *
 * История отдаётся только списком сайтов: адрес сайта, имя узла и значок.
 * Какие именно страницы открывались, странице не сообщается.
 *
 * Создаётся tools/sync-ui.py из ui/modules/. Править там.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

const PALETTE_PREF = "vantara.theme.palette";
const PALETTES = new Set(["forge", "midnight", "pine", "ash", "amber"]);

// Схема задаётся встроенными темами Firefox: в 156 они меняют только
// color_scheme и не несут своих цветов, поэтому палитра Vantara остаётся.
const MODE_THEMES = {
  system: "default-theme@mozilla.org",
  light: "firefox-compact-light@mozilla.org",
  dark: "firefox-compact-dark@mozilla.org",
};

// Что страница хранит у браузера. Настройки читаются только здесь, в
// основном процессе: длинные строки процессам вкладок не передаются.
const TILES_PREF = "vantara.newtab.tiles";
const ENGINE_PREF = "vantara.newtab.engine";
const MAX_TILES = 48;
const MAX_URL = 2048;
const MAX_NAME = 80;

// Сколько последних посещений просматривать и сколько сайтов показать.
const HISTORY_SCAN = 500;
const HISTORY_SITES = 16;
// Размер значка сайта для плиток новой вкладки (с запасом для HiDPI).
const ICON_SIZE = 96;

export const VantaraNewTab = {
  MESSAGES: new Set([
    "VantaraNewTab:ResetBlocked",
    "VantaraNewTab:SetTheme",
    "VantaraNewTab:GetHistory",
    "VantaraNewTab:RemoveHistory",
    "VantaraNewTab:GetStore",
    "VantaraNewTab:SetStore",
  ]),

  async receiveMessage({ name, data }) {
    switch (name) {
      case "VantaraNewTab:ResetBlocked":
        Services.prefs.clearUserPref("vantara.shield.blockedTotal");
        return null;
      case "VantaraNewTab:SetTheme":
        return this.setTheme(data);
      case "VantaraNewTab:GetHistory":
        return this.recentSites();
      case "VantaraNewTab:RemoveHistory":
        return this.forgetSite(data);
      case "VantaraNewTab:GetStore":
        return this.getStore();
      case "VantaraNewTab:SetStore":
        return this.setStore(data);
    }
    return null;
  },

  async setTheme({ palette, mode } = {}) {
    if (PALETTES.has(palette)) {
      Services.prefs.setStringPref(PALETTE_PREF, palette);
    }
    let id = MODE_THEMES[mode];
    if (id) {
      let addon = await lazy.AddonManager.getAddonByID(id);
      await addon?.enable();
    }
    return null;
  },

  getStore() {
    let store = {};
    try {
      store.tiles = cleanTiles(
        JSON.parse(Services.prefs.getStringPref(TILES_PREF, "[]"))
      );
    } catch (e) {
      store.tiles = [];
    }
    let engine = Services.prefs.getStringPref(ENGINE_PREF, "");
    if (engine) {
      store.engine = engine;
    }
    return store;
  },

  /** Данные приходят со страницы, поэтому сохраняется только проверенное. */
  setStore({ key, value } = {}) {
    if (key == "tiles") {
      Services.prefs.setStringPref(
        TILES_PREF,
        JSON.stringify(cleanTiles(value))
      );
    } else if (key == "engine" && /^[a-z]{1,16}$/.test(value)) {
      Services.prefs.setStringPref(ENGINE_PREF, value);
    }
    return null;
  },

  /** Последние посещённые сайты, по одному на узел, новые первыми. */
  async recentSites() {
    let { history } = lazy.PlacesUtils;
    let options = history.getNewQueryOptions();
    options.sortingMode = options.SORT_BY_DATE_DESCENDING;
    options.resultType = options.RESULTS_AS_URI;
    options.maxResults = HISTORY_SCAN;

    let root = history.executeQuery(history.getNewQuery(), options).root;
    let sites = new Map();
    root.containerOpen = true;
    try {
      for (let i = 0; i < root.childCount && sites.size < HISTORY_SITES; i++) {
        let uri;
        try {
          uri = Services.io.newURI(root.getChild(i).uri);
        } catch (e) {
          continue;
        }
        if (!uri.schemeIs("https") && !uri.schemeIs("http")) {
          continue;
        }
        if (!sites.has(uri.host)) {
          sites.set(uri.host, { host: uri.host, url: uri.prePath + "/", page: uri });
        }
      }
    } finally {
      root.containerOpen = false;
    }

    let result = [];
    for (let { host, url, page } of sites.values()) {
      let icon = "";
      try {
        // Плитка показывает значок крупно: просим самый большой из известных.
        let favicon = await lazy.PlacesUtils.favicons.getFaviconForPage(
          page,
          ICON_SIZE
        );
        icon = favicon?.dataURI?.spec ?? "";
      } catch (e) {}
      result.push({ host, url, icon });
    }
    return result;
  },

  /** Убирает сайт из истории целиком: все посещения этого узла. */
  async forgetSite({ host } = {}) {
    if (typeof host == "string" && host) {
      await lazy.PlacesUtils.history.removeByFilter({ host });
    }
    return null;
  },
};

function cleanTiles(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  let tiles = [];
  for (let tile of list) {
    let url = tile?.url;
    if (typeof url != "string" || url.length > MAX_URL) {
      continue;
    }
    let uri = URL.parse(url);
    if (uri?.protocol != "https:" && uri?.protocol != "http:") {
      continue;
    }
    let name = typeof tile.name == "string" ? tile.name.slice(0, MAX_NAME) : "";
    tiles.push({ url: uri.href, name });
    if (tiles.length == MAX_TILES) {
      break;
    }
  }
  return tiles;
}

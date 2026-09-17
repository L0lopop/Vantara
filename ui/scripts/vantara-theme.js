/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — палитра окна.
 *
 * Цвета интерфейса заданы шкалами в tokens.css, а палитры переопределяют
 * их по атрибуту vn-palette на корне окна. Скрипт ставит атрибут по
 * настройке vantara.theme.palette и меняет его сразу, когда настройку
 * переключают (например, на новой вкладке) — во всех открытых окнах.
 *
 * Светлая или тёмная схема сюда не относится: её задают встроенные темы
 * Firefox, и наши цвета следуют им сами (light-dark() в tokens.css).
 *
 * Служебные страницы (настройки, дополнения, ошибки) красит отдельный
 * лист about-pages.css. Скрипт регистрирует его один раз на сеанс как
 * пользовательский: такой лист движок применяет ко всем документам во
 * всех процессах, а внутри он сам ограничен адресами служебных страниц.
 * Палитру там выбирает @media -moz-pref(), без этого скрипта.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraTheme = {
  PREF: "vantara.theme.palette",
  DEFAULT: "forge",

  PAGES_SHEET: "chrome://browser/skin/vantara/about-pages.css",

  init() {
    this.apply();
    this.registerPagesSheet();
    Services.prefs.addObserver(this.PREF, this);
    window.addEventListener("unload", this, { once: true });
  },

  handleEvent(event) {
    if (event.type == "unload") {
      Services.prefs.removeObserver(this.PREF, this);
    }
  },

  observe() {
    this.apply();
  },

  // Сервис общий для всех окон, поэтому повторная регистрация из второго
  // окна отсекается проверкой.
  registerPagesSheet() {
    let sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    let uri = Services.io.newURI(this.PAGES_SHEET);
    if (!sss.sheetRegistered(uri, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    }
  },

  apply() {
    let palette = Services.prefs.getStringPref(this.PREF, this.DEFAULT);
    let root = document.documentElement;
    // Палитра по умолчанию — значения в начале tokens.css, без атрибута.
    if (palette == this.DEFAULT) {
      root.removeAttribute("vn-palette");
    } else {
      root.setAttribute("vn-palette", palette);
    }
  },
};

// Палитру ставим сразу, до первой отрисовки окна: иначе при запуске
// мелькнут цвета палитры по умолчанию.
gVantaraTheme.init();

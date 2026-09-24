/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — вертикальные вкладки.
 *
 * Сами вертикальные вкладки есть в Firefox 156: столбец в боковой панели
 * (настройка sidebar.verticalTabs). Но включаются они из глубины настроек
 * или из меню полосы вкладок, которое находят не все. Здесь — пункт
 * в главном меню рядом с режимом без рамки; палитра команд (F2) вызывает
 * тот же переключатель. Вид столбца — ui/chrome/vantara/tabs.css,
 * раздел «Вертикальные вкладки».
 *
 * Здесь же — стиль черты над кнопками внизу боковой панели: она внутри
 * теневого дерева sidebar-main, и лист темы до неё не достаёт.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraVertical = {
  PREF: "sidebar.verticalTabs",
  MENU_ID: "appMenu-vantara-vertical",

  STRINGS: {
    ru: { label: "Вертикальные вкладки" },
    en: { label: "Vertical tabs" },
  },

  // Черта между вкладками и кнопками внизу панели. Это разделитель,
  // за который тянут, меняя высоту кнопочной части. У Firefox в широкой
  // панели он закрашен системным цветом Windows (светло-серым в светлой
  // теме, фиолетово-серым в тёмной), в узкой — ярким штрихом цвета
  // значков, похожим на ещё одну кнопку. Здесь — волосок цвета границ
  // во всю ширину; под курсором разделитель подсвечивается, как у самой
  // панели (sidebar.css).
  LAUNCHER_CSS: `
    #sidebar-tools-and-extensions-splitter {
      background-color: transparent !important;
      background-image: linear-gradient(var(--vn-border), var(--vn-border)) !important;
      background-size: 100% 1px !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      transition: background-color var(--vn-dur-fast) var(--vn-ease-standard);
    }

    #sidebar-tools-and-extensions-splitter:hover {
      background-image: none !important;
      background-color: var(--vn-accent) !important;
      border-radius: var(--vn-radius-pill);
    }
  `,

  init() {
    this._styleLauncher();
    Services.prefs.addObserver(this.PREF, this);
    // Главное меню Firefox собирает при первом открытии, поэтому пункт
    // добавляется тогда же.
    window.addEventListener("popupshowing", this, true);
    window.addEventListener(
      "unload",
      () => Services.prefs.removeObserver(this.PREF, this),
      { once: true }
    );
  },

  _t(key) {
    let lang = Services.locale.appLocaleAsBCP47.startsWith("ru") ? "ru" : "en";
    return this.STRINGS[lang][key];
  },

  async _styleLauncher() {
    await customElements.whenDefined("sidebar-main");
    let root = document.querySelector("sidebar-main")?.shadowRoot;
    if (!root) {
      return;
    }
    let sheet = new CSSStyleSheet();
    sheet.replaceSync(this.LAUNCHER_CSS);
    // Свой лист идёт последним: при равной силе правил он и побеждает.
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  },

  get enabled() {
    return Services.prefs.getBoolPref(this.PREF, false);
  },

  toggle() {
    Services.prefs.setBoolPref(this.PREF, !this.enabled);
  },

  observe() {
    document.getElementById(this.MENU_ID)?.setAttribute("checked", this.enabled);
  },

  // Сразу под режимом без рамки: оба пункта меняют раскладку окна.
  _addMenuItem() {
    if (document.getElementById(this.MENU_ID)) {
      return;
    }
    let after = document.getElementById("appMenu-vantara-frameless") ??
                document.getElementById("appMenu-zoom-controls");
    if (!after) {
      return;
    }
    let item = document.createXULElement("toolbarbutton");
    item.id = this.MENU_ID;
    item.className = "subviewbutton";
    item.setAttribute("type", "checkbox");
    item.setAttribute("label", this._t("label"));
    item.addEventListener("command", () => this.toggle());
    after.after(item);
  },

  handleEvent(event) {
    if (event.type == "popupshowing" && event.target.id == "appMenu-popup") {
      this._addMenuItem();
      this.observe();
    }
  },
};

{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraVertical.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

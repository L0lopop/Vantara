/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — режим без рамки.
 *
 * Полоса вкладок и панель навигации уезжают за верхний край окна, и
 * страница занимает его целиком. Стоит подвести курсор к верхнему краю —
 * панель выезжает поверх страницы и прячется снова, когда курсор ушёл.
 * Пока в панели идёт работа — набирается адрес или открыто меню, —
 * она не прячется.
 *
 * Включается сочетанием Ctrl+Shift+F или пунктом главного меню. Состояние
 * хранится в настройке vantara.frameless и действует во всех окнах сразу.
 * Вид — ui/chrome/vantara/base.css, атрибут vn-frameless.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraFrameless = {
  PREF: "vantara.frameless",
  KEY_ID: "key_vantaraFrameless",
  MENU_ID: "appMenu-vantara-frameless",

  STRINGS: {
    ru: { label: "Режим без рамки" },
    en: { label: "Frameless mode" },
  },

  // Всплывающие окна, открытые из панели: пока хоть одно открыто, панель
  // не уезжает, иначе меню повисло бы в воздухе без своей кнопки.
  _openPopups: new Set(),

  init() {
    this._addKey();
    this._apply();
    Services.prefs.addObserver(this.PREF, this);
    // Главное меню Firefox собирает при первом открытии, поэтому пункт
    // добавляется тогда же.
    window.addEventListener("popupshowing", this, true);
    window.addEventListener("popupshown", this, true);
    window.addEventListener("popuphidden", this, true);
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

  get enabled() {
    return Services.prefs.getBoolPref(this.PREF, false);
  },

  toggle() {
    Services.prefs.setBoolPref(this.PREF, !this.enabled);
  },

  observe() {
    this._apply();
  },

  _apply() {
    let on = this.enabled;
    document.documentElement.toggleAttribute("vn-frameless", on);
    document.getElementById(this.MENU_ID)?.setAttribute("checked", on);
  },

  _addKey() {
    let keyset = document.getElementById("mainKeyset");
    if (!keyset || document.getElementById(this.KEY_ID)) {
      return;
    }
    let key = document.createXULElement("key");
    key.id = this.KEY_ID;
    key.setAttribute("key", "F");
    key.setAttribute("modifiers", "accel,shift");
    key.addEventListener("command", () => this.toggle());
    keyset.append(key);
    // Обработчик клавиш читает набор один раз; переставленный набор он
    // перечитает вместе с новой клавишей.
    keyset.parentNode.append(keyset);
  },

  _addMenuItem() {
    let zoom = document.getElementById("appMenu-zoom-controls");
    if (!zoom || document.getElementById(this.MENU_ID)) {
      return;
    }
    let item = document.createXULElement("toolbarbutton");
    item.id = this.MENU_ID;
    item.className = "subviewbutton";
    item.setAttribute("type", "checkbox");
    item.setAttribute("label", this._t("label"));
    let key = document.getElementById(this.KEY_ID);
    if (key) {
      item.setAttribute("shortcut", ShortcutUtils.prettifyShortcut(key));
    }
    item.addEventListener("command", () => this.toggle());
    zoom.after(item);
  },

  handleEvent(event) {
    if (event.type == "popupshowing") {
      if (event.target.id == "appMenu-popup") {
        this._addMenuItem();
        this._apply();
      }
      return;
    }
    let toolbox = gNavToolbox;
    let anchor = event.target.anchorNode ?? event.target.triggerNode;
    if (event.type == "popupshown") {
      if (anchor && toolbox.contains(anchor)) {
        this._openPopups.add(event.target);
      }
    } else {
      this._openPopups.delete(event.target);
    }
    toolbox.toggleAttribute("vn-reveal", this._openPopups.size > 0);
  },
};

{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraFrameless.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

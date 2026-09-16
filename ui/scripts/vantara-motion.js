/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — движение интерфейса.
 *
 * Состояния, которые CSS нарисует сам, но узнать о них не может: только
 * движок знает, что страница начала или закончила грузиться. Скрипт
 * переводит эти события в атрибуты, стили — в navbar.css.
 *
 *   #urlbar[vn-loading] — волна по нижней кромке адресной строки вместо
 *   отдельной полосы прогресса. Только для видимой вкладки.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraMotion = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  get urlbar() {
    return document.getElementById("urlbar");
  },

  init() {
    gBrowser.addTabsProgressListener(this);
    gBrowser.tabContainer.addEventListener("TabSelect", this);
    window.addEventListener("unload", this, { once: true });
    this._syncLoading();
  },

  uninit() {
    gBrowser.removeTabsProgressListener(this);
    gBrowser.tabContainer.removeEventListener("TabSelect", this);
  },

  handleEvent(event) {
    if (event.type == "TabSelect") {
      // У новой вкладки своё состояние: она могла грузиться в фоне.
      this._syncLoading();
    } else if (event.type == "unload") {
      this.uninit();
    }
  },

  onStateChange(browser, webProgress, request, stateFlags) {
    const { STATE_IS_NETWORK, STATE_START, STATE_STOP } =
      Ci.nsIWebProgressListener;

    // Нас интересует загрузка документа верхнего уровня, а не каждая
    // картинка и не вложенные фреймы.
    if (!webProgress.isTopLevel || !(stateFlags & STATE_IS_NETWORK)) {
      return;
    }
    if (browser != gBrowser.selectedBrowser) {
      return;
    }
    if (stateFlags & STATE_START) {
      this._setLoading(true);
    } else if (stateFlags & STATE_STOP) {
      this._setLoading(false);
    }
  },

  _syncLoading() {
    let progress = gBrowser.selectedBrowser?.webProgress;
    this._setLoading(!!progress?.isLoadingDocument);
  },

  _setLoading(loading) {
    this.urlbar?.toggleAttribute("vn-loading", loading);
  },
};

{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraMotion.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

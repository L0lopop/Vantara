/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — живой щит.
 *
 * Показывает у адресной строки, сколько отслеживания заблокировано на
 * текущей странице, и коротко пульсирует в момент новой блокировки.
 * Стили — в navbar.css (атрибуты vn-count и vn-blocked); здесь только
 * источник событий.
 *
 * Данные берутся из журнала блокировок движка, а не считаются заново.
 * Каждая запись журнала — [тип, заблокировано, повторов]; формат задан
 * в toolkit/components/antitracking/ContentBlockingLog.h.
 *
 * Общий счётчик за всё время — одно число в настройках. Ни адресов, ни
 * названий сайтов в нём нет: счётчик блокировок не должен превращаться
 * в историю посещений. Приватные окна в него не пишут ничего.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraShield = {
  // Длительность пульса совпадает с --vn-dur-slower в tokens.css.
  PULSE_MS: 560,
  TOTAL_PREF: "vantara.shield.blockedTotal",
  // Запись в настройки откладывается: на тяжёлой странице блокировки
  // идут десятками в секунду, и писать на диск каждую незачем.
  SAVE_DELAY_MS: 2000,

  // Последний известный счётчик по каждой вкладке. WeakMap — чтобы
  // закрытая вкладка не держала память.
  _counts: new WeakMap(),
  _pulseTimer: null,
  _saveTimer: null,
  _pendingTotal: 0,
  _private: false,

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  get container() {
    return document.getElementById("tracking-protection-icon-container");
  },

  init() {
    this._private = PrivateBrowsingUtils.isWindowPrivate(window);
    gBrowser.addTabsProgressListener(this);
    gBrowser.tabContainer.addEventListener("TabSelect", this);
    window.addEventListener("unload", this, { once: true });
    this._render(this._countFor(gBrowser.selectedBrowser), false);
  },

  uninit() {
    gBrowser.removeTabsProgressListener(this);
    gBrowser.tabContainer.removeEventListener("TabSelect", this);
    clearTimeout(this._pulseTimer);
    this._flushTotal();
  },

  handleEvent(event) {
    if (event.type == "TabSelect") {
      this._render(this._countFor(gBrowser.selectedBrowser), false);
    } else if (event.type == "unload") {
      this.uninit();
    }
  },

  /* --- Слушатель прогресса всех вкладок --------------------------------- */

  onLocationChange(browser, webProgress, request, location, flags) {
    if (!webProgress.isTopLevel) {
      return;
    }
    // Переход по якорю — тот же документ, счётчик не сбрасываем.
    if (flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
      return;
    }
    this._counts.set(browser, 0);
    if (browser == gBrowser.selectedBrowser) {
      this._render(0, false);
    }
  },

  onContentBlockingEvent(browser, webProgress, request, event, isSimulated) {
    // Симулированное событие движок шлёт при переключении вкладки: оно
    // пересказывает старое состояние, а не сообщает о новой блокировке.
    // Считать его — значит пульсировать и накручивать счётчик на каждом
    // переключении.
    let count = this._countFor(browser);
    let previous = this._counts.get(browser) ?? 0;
    this._counts.set(browser, count);

    let grown = isSimulated ? 0 : Math.max(0, count - previous);
    if (grown > 0) {
      this._addToTotal(grown);
    }

    if (browser == gBrowser.selectedBrowser) {
      this._render(count, grown > 0);
    }
  },

  /* --- Подсчёт ----------------------------------------------------------- */

  _countFor(browser) {
    // Журнала может не быть: вкладка ещё грузится или это about:.
    let raw = browser?.getContentBlockingLog();
    if (!raw) {
      return 0;
    }

    let log;
    try {
      log = JSON.parse(raw);
    } catch (e) {
      return 0;
    }

    let total = 0;
    for (let actions of Object.values(log)) {
      for (let [, blocked, repeat] of actions) {
        if (blocked) {
          total += repeat || 1;
        }
      }
    }
    return total;
  },

  /* --- Отрисовка --------------------------------------------------------- */

  _render(count, pulse) {
    let container = this.container;
    if (!container) {
      return;
    }

    if (count > 0) {
      container.setAttribute("vn-count", count);
    } else {
      container.removeAttribute("vn-count");
    }

    if (pulse) {
      this._pulse(container);
    }
  },

  _pulse(container) {
    // Анимация перезапускается только если атрибут сняли и поставили
    // в разных кадрах — иначе браузер считает, что ничего не менялось.
    clearTimeout(this._pulseTimer);
    container.removeAttribute("vn-blocked");
    requestAnimationFrame(() => {
      container.setAttribute("vn-blocked", "true");
      this._pulseTimer = setTimeout(
        () => container.removeAttribute("vn-blocked"),
        this.PULSE_MS
      );
    });
  },

  /* --- Счётчик за всё время ---------------------------------------------- */

  _addToTotal(amount) {
    // Приватное окно не оставляет следов — даже одного числа.
    if (this._private) {
      return;
    }
    this._pendingTotal += amount;
    if (!this._saveTimer) {
      this._saveTimer = setTimeout(() => this._flushTotal(), this.SAVE_DELAY_MS);
    }
  },

  _flushTotal() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    if (!this._pendingTotal) {
      return;
    }
    let current = Services.prefs.getIntPref(this.TOTAL_PREF, 0);
    Services.prefs.setIntPref(this.TOTAL_PREF, current + this._pendingTotal);
    this._pendingTotal = 0;
  },
};

// Скрипт подгружается раньше, чем окно готово: gBrowser появляется
// позже. Стартуем, когда движок сообщит, что это окно полностью открыто.
{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraShield.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

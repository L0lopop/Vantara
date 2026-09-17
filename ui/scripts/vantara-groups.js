/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — группы вкладок.
 *
 * Сами группы есть в движке Firefox: вкладку можно перетащить на другую
 * или выбрать «Добавить вкладку в новую группу» в её меню. Но найти это
 * почти невозможно, а вкладки при объединении просто перескакивают на
 * новое место. Скрипт добавляет две вещи:
 *
 *   1. Кнопку «Сгруппировать вкладки» на полосе вкладок. Она объединяет
 *      выделенные вкладки (Ctrl+щелчок выделяет несколько) или текущую и
 *      открывает панель Firefox, где группе дают имя и цвет.
 *
 *   2. Анимацию слияния. Вкладки плавно съезжаются с прежних мест к
 *      группе, её ярлык появляется с отскоком, а линия группы вырастает
 *      под вкладками (стили — tabs.css, атрибут vn-merging).
 *
 * Анимация встроена в метод addTabs элемента tab-group: через него
 * проходят все способы объединения — кнопка, меню вкладки, добавление
 * в существующую группу. При перетаскивании Firefox двигает вкладки сам,
 * и тогда остаётся только ярлык и линия, без полёта вкладок.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraGroups = {
  WIDGET_ID: "vantara-group-button",
  // Совпадает с --vn-dur-slower: столько живёт атрибут vn-merging.
  MERGE_MS: 520,
  FLY_MS: 420,
  STAGGER_MS: 35,

  STRINGS: {
    ru: {
      label: "Сгруппировать вкладки",
      tooltip: "Сгруппировать вкладки — выделите несколько с Ctrl",
    },
    en: {
      label: "Group tabs",
      tooltip: "Group tabs — Ctrl+click to select several",
    },
  },

  _mergeTimers: new WeakMap(),

  init() {
    this._registerWidget();
    this._wrapAddTabs();
  },

  _t(key) {
    let lang = Services.locale.appLocaleAsBCP47.startsWith("ru") ? "ru" : "en";
    return this.STRINGS[lang][key];
  },

  /* --- Кнопка ------------------------------------------------------------ */

  _registerWidget() {
    if (CustomizableUI.getWidget(this.WIDGET_ID)?.provider ==
        CustomizableUI.PROVIDER_API) {
      return;
    }
    CustomizableUI.createWidget({
      id: this.WIDGET_ID,
      type: "button",
      localized: false,
      label: this._t("label"),
      tooltiptext: this._t("tooltip"),
      defaultArea: CustomizableUI.AREA_TABSTRIP,
      onCommand(event) {
        event.target.documentGlobal.gVantaraGroups.groupSelected();
      },
    });
  },

  /** Объединяет выделенные вкладки в новую группу — как меню вкладки. */
  groupSelected() {
    let tabs = gBrowser.selectedTabs.filter(tab => !tab.pinned);
    if (!tabs.length) {
      return;
    }
    // Одна вкладка, уже в группе: вместо новой группы из одной вкладки —
    // настройки существующей.
    if (tabs.length == 1 && tabs[0].group) {
      gBrowser.tabGroupMenu.openEditModal(tabs[0].group);
      return;
    }
    let first = tabs[0];
    gBrowser.addTabGroup(tabs, {
      insertBefore: first.group ?? first.splitview ?? first,
      metricsContext: gBrowser.TabMetrics.userTriggeredContext(
        gBrowser.TabMetrics.METRIC_SOURCE.TAB_MENU
      ),
    });
    gBrowser.selectedTab = first;
  },

  /* --- Анимация слияния ---------------------------------------------------- */

  // У каждого окна свой реестр элементов и свой прототип tab-group, поэтому
  // обёртка ставится в каждом окне один раз.
  _wrapAddTabs() {
    let proto = customElements.get("tab-group")?.prototype;
    if (!proto || proto.vantaraMergeWrapped) {
      return;
    }
    let original = proto.addTabs;
    proto.addTabs = function (items, ...rest) {
      let groups = this.documentGlobal.gVantaraGroups;
      let before = groups?._snapshot(items);
      let result = original.call(this, items, ...rest);
      groups?._animateMerge(this, before);
      return result;
    };
    proto.vantaraMergeWrapped = true;
  },

  get _reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  /** Где вкладки стояли до объединения. */
  _snapshot(items) {
    let rects = new Map();
    if (this._reducedMotion) {
      return rects;
    }
    for (let item of items ?? []) {
      let tabs = gBrowser.isSplitViewWrapper(item) ? item.tabs : [item];
      for (let tab of tabs) {
        // Вкладка из другого окна или скрытая — лететь ей неоткуда.
        if (tab.documentGlobal == window && tab.isConnected && !tab.hidden) {
          rects.set(tab, tab.getBoundingClientRect());
        }
      }
    }
    return rects;
  },

  _animateMerge(group, before) {
    if (this._reducedMotion || !group.isConnected) {
      return;
    }

    // Ярлык и линия группы: атрибут перезапускает анимацию в tabs.css.
    clearTimeout(this._mergeTimers.get(group));
    group.removeAttribute("vn-merging");
    void group.getBoundingClientRect();
    group.setAttribute("vn-merging", "true");
    this._mergeTimers.set(
      group,
      setTimeout(() => group.removeAttribute("vn-merging"), this.MERGE_MS)
    );

    // При перетаскивании вкладки двигает сам Firefox.
    let dragging = gBrowser.tabContainer.hasAttribute("movingtab");
    let index = 0;
    for (let [tab, from] of before ?? []) {
      if (!tab.isConnected || tab.group != group) {
        continue;
      }
      let to = tab.getBoundingClientRect();
      let dx = Math.round(from.left - to.left);
      let dy = Math.round(from.top - to.top);
      let start = !dragging && (dx || dy)
        ? `translate(${dx}px, ${dy}px) scale(0.94)`
        : "scale(0.94)";
      tab.animate(
        [
          { transform: start, opacity: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        {
          duration: this.FLY_MS,
          delay: index++ * this.STAGGER_MS,
          easing: "cubic-bezier(0.05, 0.7, 0.1, 1)",
          // Пока вкладка ждёт своей очереди, она остаётся на старом месте.
          fill: "backwards",
        }
      );
    }
  },
};

{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraGroups.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

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
 *   2. Анимацию слияния. Вкладки не перескакивают, а стягиваются к группе
 *      с оттяжкой и на миг сплющиваются, как капли, — потом их заливает
 *      общая лужица цвета группы (стили — tabs.css, атрибут vn-merging).
 *
 *   3. Список вкладок в панели группы. Родная панель Firefox показывает
 *      имя, цвет и набор действий, но не сами вкладки: что в группе —
 *      приходится вспоминать. Мы дописываем в неё список с значками
 *      сайтов (по щелчку — переход, крестик закрывает вкладку) и одну
 *      кнопку внизу: закрыть группу целиком.
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
  FLY_MS: 460,
  STAGGER_MS: 40,

  STRINGS: {
    ru: {
      label: "Сгруппировать вкладки",
      tooltip: "Сгруппировать вкладки — выделите несколько с Ctrl",
      closeGroup: "Закрыть группу",
      closeTab: "Закрыть вкладку",
      clearName: "Стереть имя",
      // Одна вкладка, две вкладки, пять вкладок.
      tabWord: ["вкладка", "вкладки", "вкладок"],
    },
    en: {
      label: "Group tabs",
      tooltip: "Group tabs — Ctrl+click to select several",
      closeGroup: "Close group",
      closeTab: "Close tab",
      clearName: "Clear the name",
      tabWord: ["tab", "tabs"],
    },
  },

  _mergeTimers: new WeakMap(),

  init() {
    this._registerWidget();
    this._wrapAddTabs();
    this._watchPanel();
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

  /* --- Панель группы --------------------------------------------------------
   * Панель — элемент движка (tabgroup-menu.js), свои части мы дописываем
   * в неё при первом показе и обновляем при каждом следующем.
   * ------------------------------------------------------------------------ */

  _watchPanel() {
    document.addEventListener("popupshown", event => {
      let panel = event.target;
      if (panel?.classList?.contains("tab-group-editor-panel")) {
        this._fillPanel(panel);
      }
    });
  },

  _plural(count, forms) {
    if (forms.length == 2) {
      return count == 1 ? forms[0] : forms[1];
    }
    let ten = count % 10;
    let hundred = count % 100;
    if (ten == 1 && hundred != 11) {
      return forms[0];
    }
    if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) {
      return forms[1];
    }
    return forms[2];
  },

  _fillPanel(panel) {
    let group = panel.parentElement?.activeGroup;
    if (!group?.isConnected) {
      return;
    }
    let parts = this._panelParts(panel);
    parts.list.style.setProperty("--vn-group-color",
                                 `var(--tab-group-${group.color})`);
    parts.close.style.setProperty("--vn-group-color",
                                  `var(--tab-group-${group.color})`);
    parts.list.textContent = "";

    for (let tab of group.tabs) {
      parts.list.append(this._tabRow(panel, group, tab));
    }

    let count = group.tabs.length;
    parts.count.textContent =
      `${count} ${this._plural(count, this._t("tabWord"))}`;
    parts.close.hidden = panel.classList.contains("tab-group-editor-mode-create");
    parts.clear.hidden = !parts.name.value;
  },

  /** Один ряд списка: значок сайта, заголовок и крестик. */
  _tabRow(panel, group, tab) {
    let row = document.createElement("div");
    row.className = "vn-group-tab";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    if (tab.selected) {
      row.classList.add("vn-current");
    }

    let icon = document.createElement("img");
    icon.className = "vn-group-tab-icon";
    icon.src = tab.image || "chrome://global/skin/icons/defaultFavicon.svg";
    icon.alt = "";
    icon.addEventListener("error", () => {
      icon.src = "chrome://global/skin/icons/defaultFavicon.svg";
    });

    let name = document.createElement("span");
    name.className = "vn-group-tab-name";
    name.textContent = tab.label;

    let close = document.createElement("button");
    close.className = "vn-group-tab-close";
    close.type = "button";
    close.title = this._t("closeTab");
    close.addEventListener("click", event => {
      event.stopPropagation();
      gBrowser.removeTab(tab, { animate: true });
      // Последняя вкладка закрывает и саму группу — панели больше не к чему
      // относиться.
      if (group.tabs.length <= 1) {
        panel.hidePopup();
      } else {
        this._fillPanel(panel);
      }
    });

    row.append(icon, name, close);
    let open = () => {
      gBrowser.selectedTab = tab;
      panel.hidePopup();
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", event => {
      if (event.key == "Enter" || event.key == " ") {
        event.preventDefault();
        open();
      }
    });
    return row;
  },

  /** Создаёт свои части панели один раз и возвращает их. */
  _panelParts(panel) {
    let parts = this._panels?.get(panel);
    if (parts) {
      return parts;
    }
    this._panels ??= new WeakMap();

    let name = panel.querySelector("#tab-group-name");
    let clear = document.createElement("button");
    clear.className = "vn-group-clear";
    clear.type = "button";
    clear.title = this._t("clearName");
    clear.addEventListener("click", () => {
      name.value = "";
      name.dispatchEvent(new Event("input", { bubbles: true }));
      name.focus();
      clear.hidden = true;
    });
    name.addEventListener("input", () => {
      clear.hidden = !name.value;
    });
    name.parentElement.append(clear);

    let list = document.createElement("div");
    list.className = "vn-group-tabs";
    panel.querySelector(".tab-group-editor-swatches").after(list);

    let close = document.createElement("button");
    close.className = "vn-group-close";
    close.type = "button";
    let label = document.createElement("span");
    label.textContent = this._t("closeGroup");
    let count = document.createElement("span");
    count.className = "vn-group-count";
    close.append(label, count);
    close.addEventListener("click", () => {
      let group = panel.parentElement?.activeGroup;
      group?.saveAndClose(
        gBrowser.TabMetrics.userTriggeredContext(
          gBrowser.TabMetrics.METRIC_SOURCE.TAB_GROUP_MENU
        )
      );
      panel.hidePopup();
    });
    // Сразу под списком: закрыть группу — то, ради чего панель открывают
    // чаще всего. Остальные действия движка остаются ниже разделителя.
    list.after(close);

    parts = { list, close, count, name, clear };
    this._panels.set(panel, parts);
    return parts;
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
      let dx = dragging ? 0 : Math.round(from.left - to.left);
      let dy = dragging ? 0 : Math.round(from.top - to.top);
      // Вкладку словно притягивает: в полёте она вытянута по ходу движения,
      // на месте — пружинит поперёк и успокаивается.
      tab.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.9)`,
            opacity: dx || dy ? 0.55 : 0.75,
          },
          {
            offset: 0.68,
            transform: `translate(${Math.round(dx * 0.12)}px, ` +
                       `${Math.round(dy * 0.12)}px) scale(1.05, 0.93)`,
            opacity: 1,
          },
          { offset: 0.86, transform: "scale(0.98, 1.03)" },
          { transform: "none", opacity: 1 },
        ],
        {
          duration: this.FLY_MS,
          delay: index++ * this.STAGGER_MS,
          easing: "cubic-bezier(0.22, 1, 0.3, 1)",
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

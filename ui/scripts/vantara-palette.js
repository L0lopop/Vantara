/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — палитра команд.
 *
 * F2 открывает строку поверх окна: набираешь пару букв — и переходишь на
 * нужную вкладку из любого окна или выполняешь действие браузера, не
 * вспоминая, в каком меню оно лежит. Стрелки выбирают, Enter выполняет,
 * Esc закрывает.
 *
 * F2 — как в Vivaldi. Ctrl+Shift+P, которое обычно берут для палитры,
 * в Firefox открывает приватное окно, и отнимать его нельзя.
 *
 * Палитра ничего не запоминает и никуда не отправляет введённое: поиск
 * идёт по открытым вкладкам и по списку команд здесь же, в окне.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraPalette = {
  PANEL_ID: "vantara-palette",
  KEY_ID: "key_vantaraPalette",
  MAX_ITEMS: 12,
  // Сколько вкладок показать, пока ничего не набрано.
  RECENT_TABS: 5,
  ICONS: "chrome://browser/skin/vantara/icons/",

  STRINGS: {
    ru: {
      title: "Палитра команд",
      placeholder: "Вкладка или действие…",
      tabs: "Вкладки",
      commands: "Действия",
      nothing: "Ничего не нашлось",
      newTab: "Новая вкладка",
      newWindow: "Новое окно",
      privateWindow: "Новое приватное окно",
      reopenTab: "Вернуть закрытую вкладку",
      closeTab: "Закрыть вкладку",
      frameless: "Режим без рамки",
      verticalTabs: "Вертикальные вкладки",
      groupTabs: "Сгруппировать вкладки",
      sidebarTabs: "Боковая панель: открытые вкладки",
      sidebarHistory: "Боковая панель: история",
      sidebarBookmarks: "Боковая панель: закладки",
      leaks: "Журнал запросов этой страницы",
      find: "Найти на странице",
      print: "Печать",
      downloads: "Загрузки",
      clearData: "Удалить историю и данные сайтов",
      settings: "Настройки",
      privacy: "Настройки приватности и защиты",
      addons: "Расширения и темы",
      passwords: "Пароли",
      themeDark: "Оформление: тёмное",
      themeLight: "Оформление: светлое",
      themeSystem: "Оформление: как в системе",
    },
    en: {
      title: "Command palette",
      placeholder: "A tab or an action…",
      tabs: "Tabs",
      commands: "Actions",
      nothing: "Nothing found",
      newTab: "New tab",
      newWindow: "New window",
      privateWindow: "New private window",
      reopenTab: "Reopen closed tab",
      closeTab: "Close tab",
      frameless: "Frameless mode",
      verticalTabs: "Vertical tabs",
      groupTabs: "Group tabs",
      sidebarTabs: "Sidebar: open tabs",
      sidebarHistory: "Sidebar: history",
      sidebarBookmarks: "Sidebar: bookmarks",
      leaks: "Request log of this page",
      find: "Find in page",
      print: "Print",
      downloads: "Downloads",
      clearData: "Clear history and site data",
      settings: "Settings",
      privacy: "Privacy and security settings",
      addons: "Add-ons and themes",
      passwords: "Passwords",
      themeDark: "Appearance: dark",
      themeLight: "Appearance: light",
      themeSystem: "Appearance: system",
    },
  },

  // Слова, по которым команду находят, кроме её названия: на обоих языках,
  // чтобы находилось при любой раскладке мысли.
  KEYWORDS: {
    newTab: "tab вкладка открыть",
    newWindow: "window окно",
    privateWindow: "private incognito приват инкогнито",
    reopenTab: "undo restore вернуть восстановить закрытую",
    closeTab: "close закрыть",
    frameless: "frameless fullscreen compact рамка полный экран компакт",
    verticalTabs: "vertical tabs sidebar вертикальные вкладки столбец сбоку",
    groupTabs: "group группа папка",
    sidebarTabs: "sidebar tabs боковая вкладки",
    sidebarHistory: "sidebar history боковая история журнал",
    sidebarBookmarks: "sidebar bookmarks боковая закладки избранное",
    leaks: "log requests trackers журнал запросы трекеры утечки",
    find: "find search найти поиск",
    print: "print печать",
    downloads: "downloads загрузки скачанное",
    clearData: "clear delete history cookies очистить удалить куки",
    settings: "settings preferences настройки параметры",
    privacy: "privacy security tracking приватность защита слежка",
    addons: "addons extensions themes расширения дополнения темы",
    passwords: "passwords logins пароли логины",
    themeDark: "theme dark тема тёмная темная",
    themeLight: "theme light тема светлая",
    themeSystem: "theme system тема система",
  },

  _items: [],
  _selected: 0,

  init() {
    this._addKey();
  },

  _t(key) {
    let lang = Services.locale.appLocaleAsBCP47.startsWith("ru") ? "ru" : "en";
    return this.STRINGS[lang][key];
  },

  _html(tag) {
    return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
  },

  _addKey() {
    let keyset = document.getElementById("mainKeyset");
    if (!keyset || document.getElementById(this.KEY_ID)) {
      return;
    }
    let key = document.createXULElement("key");
    key.id = this.KEY_ID;
    key.setAttribute("keycode", "VK_F2");
    key.addEventListener("command", () => this.toggle());
    keyset.append(key);
    // Обработчик клавиш читает набор один раз; переставленный набор он
    // перечитает вместе с новой клавишей.
    keyset.parentNode.append(keyset);
  },

  /* --- Панель ------------------------------------------------------------ */

  get panel() {
    return document.getElementById(this.PANEL_ID) ?? this._createPanel();
  },

  _createPanel() {
    let panel = document.createXULElement("panel");
    panel.id = this.PANEL_ID;
    panel.className = "vn-palette";
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", this._t("title"));

    let box = this._html("div");
    box.className = "vn-palette-box";
    let input = this._html("input");
    input.className = "vn-palette-input";
    input.type = "text";
    input.placeholder = this._t("placeholder");
    input.setAttribute("aria-label", this._t("title"));
    input.addEventListener("input", () => this._update());
    input.addEventListener("keydown", event => this._onKey(event));
    let list = this._html("ul");
    list.className = "vn-palette-list";
    list.setAttribute("role", "listbox");
    box.append(input, list);
    panel.append(box);

    panel.addEventListener("popupshown", () => input.focus());
    document.getElementById("mainPopupSet").append(panel);
    return panel;
  },

  toggle() {
    let panel = this.panel;
    if (panel.state == "open" || panel.state == "showing") {
      panel.hidePopup();
    } else {
      this.open();
    }
  },

  open() {
    let panel = this.panel;
    let input = panel.querySelector(".vn-palette-input");
    input.value = "";
    this._update();
    // Сверху по центру окна, над страницей: там, куда смотрят, когда
    // набирают адрес.
    let anchor = document.getElementById("browser");
    let width = 560;
    panel.openPopup(anchor, {
      position: "overlap",
      x: Math.max(0, Math.round((anchor.clientWidth - width) / 2)),
      y: 48,
    });
  },

  /* --- Что можно найти --------------------------------------------------- */

  _commands() {
    let command = id => () => document.getElementById(id)?.doCommand();
    let sidebar = view => () => SidebarController.show(view);
    let theme = mode => () => {
      ChromeUtils.importESModule(
        "chrome://browser/content/vantara/modules/VantaraNewTab.sys.mjs"
      ).VantaraNewTab.setTheme({ mode });
    };
    let list = [
      ["newTab", "plus", command("cmd_newNavigatorTab"), "key_newNavigatorTab"],
      ["newWindow", "window-restore", command("cmd_newNavigator"), "key_newNavigator"],
      ["privateWindow", "private", command("Tools:PrivateBrowsing"), "key_privatebrowsing"],
      ["reopenTab", "history", command("History:UndoCloseTab"), "key_restoreLastClosedTabOrWindowOrSession"],
      ["closeTab", "close", command("cmd_close"), "key_close"],
      ["frameless", "window-max", () => gVantaraFrameless?.toggle(), "key_vantaraFrameless"],
      ["verticalTabs", "sidebar", () => gVantaraVertical?.toggle()],
      ["groupTabs", "group", () => gVantaraGroups?.groupSelected()],
      ["sidebarTabs", "tabs", sidebar("viewOpenTabsSidebar")],
      ["sidebarHistory", "history", sidebar("viewHistorySidebar")],
      ["sidebarBookmarks", "star", sidebar("viewBookmarksSidebar")],
      ["leaks", "journal", () => this._openLeaks()],
      ["find", "search", command("cmd_find"), "key_find"],
      ["print", "print", command("cmd_print"), "printKb"],
      ["downloads", "download", command("Tools:Downloads"), "key_openDownloads"],
      ["clearData", "trash", command("Tools:Sanitize"), "key_sanitize"],
      ["settings", "settings", () => openPreferences()],
      ["privacy", "shield", () => openPreferences("panePrivacy")],
      ["addons", "extensions", command("Tools:Addons"), "key_openAddons"],
      ["passwords", "lock", () => openTrustedLinkIn("about:logins", "tab")],
      ["themeDark", "palette", theme("dark")],
      ["themeLight", "palette", theme("light")],
      ["themeSystem", "palette", theme("system")],
    ];
    return list.map(([id, icon, run, keyId]) => {
      let key = keyId && document.getElementById(keyId);
      return {
        kind: "command",
        label: this._t(id),
        search: `${this._t(id)} ${this.KEYWORDS[id] ?? ""}`,
        hint: key ? ShortcutUtils.prettifyShortcut(key) : "",
        icon: this.ICONS + icon + ".svg",
        run,
      };
    });
  },

  // Журнал открывается у своей кнопки, а если её убрали с панели —
  // у кнопки меню, как подменю Firefox.
  _openLeaks() {
    let node = CustomizableUI.getWidget(gVantaraLeaks.WIDGET_ID)?.forWindow(window)?.node;
    let anchor = node?.checkVisibility() ? node : document.getElementById("PanelUI-menu-button");
    PanelUI.showSubView(gVantaraLeaks.VIEW_ID, anchor);
  },

  // Вкладки всех окон, недавние первыми. Текущая не нужна: на ней и так
  // находишься. Приватные окна и обычные друг друга не видят, как и в
  // адресной строке Firefox.
  _tabs() {
    let tabs = [];
    let isPrivate = PrivateBrowsingUtils.isWindowPrivate(window);
    for (let win of BrowserWindowTracker.orderedWindows) {
      if (PrivateBrowsingUtils.isWindowPrivate(win) != isPrivate) {
        continue;
      }
      for (let tab of win.gBrowser.tabs) {
        if (tab == gBrowser.selectedTab || tab.closing) {
          continue;
        }
        // У служебных страниц (about:, file:) нет хоста — показываем адрес.
        let uri = tab.linkedBrowser.currentURI;
        let host = "";
        try {
          host = uri.host;
        } catch (e) {}
        let where = host || uri.spec;
        tabs.push({
          kind: "tab",
          label: tab.label,
          search: `${tab.label} ${where}`,
          hint: where,
          icon: tab.image || "chrome://global/skin/icons/defaultFavicon.svg",
          lastAccessed: tab.lastAccessed,
          run: () => {
            win.gBrowser.selectedTab = tab;
            win.focus();
          },
        });
      }
    }
    return tabs.sort((a, b) => b.lastAccessed - a.lastAccessed);
  },

  _normalize(text) {
    return text.toLocaleLowerCase().replaceAll("ё", "е");
  },

  // Совпадение в начале слова названия ценнее совпадения в середине,
  // а название — ценнее ключевых слов и адреса.
  _score(item, query) {
    let label = this._normalize(item.label);
    let at = label.indexOf(query);
    if (at == 0) {
      return 0;
    }
    if (at > 0) {
      return label[at - 1] == " " ? 1 : 2 + at / 100;
    }
    let rest = this._normalize(item.search);
    let wordAt = rest.indexOf(query);
    return wordAt >= 0 ? 10 + wordAt / 1000 : -1;
  },

  _update() {
    let query = this._normalize(
      this.panel.querySelector(".vn-palette-input").value.trim()
    );
    let tabs = this._tabs();
    let commands = this._commands();
    let pick = list => {
      if (!query) {
        return list;
      }
      return list
        .map(item => [item, this._score(item, query)])
        .filter(([, score]) => score >= 0)
        .sort((a, b) => a[1] - b[1])
        .map(([item]) => item);
    };
    let foundTabs = pick(tabs).slice(0, query ? this.MAX_ITEMS : this.RECENT_TABS);
    // Пока ничего не набрано, видны все действия: палитра заодно
    // показывает, что она умеет.
    let foundCommands = query ? pick(commands).slice(0, this.MAX_ITEMS) : commands;
    this._items = [...foundTabs, ...foundCommands];
    this._selected = 0;
    this._render(foundTabs, foundCommands);
  },

  _render(tabs, commands) {
    let list = this.panel.querySelector(".vn-palette-list");
    list.textContent = "";
    if (!this._items.length) {
      let empty = this._html("li");
      empty.className = "vn-palette-empty";
      empty.textContent = this._t("nothing");
      list.append(empty);
      return;
    }
    let index = 0;
    for (let [title, items] of [[this._t("tabs"), tabs], [this._t("commands"), commands]]) {
      if (!items.length) {
        continue;
      }
      let section = this._html("li");
      section.className = "vn-palette-section";
      section.textContent = title;
      list.append(section);
      for (let item of items) {
        list.append(this._row(item, index++));
      }
    }
    this._select(0);
  },

  _row(item, index) {
    let row = this._html("li");
    row.className = "vn-palette-item";
    row.setAttribute("role", "option");
    row.dataset.index = index;
    row.setAttribute("kind", item.kind);

    let icon = this._html("img");
    icon.className = "vn-palette-icon";
    icon.src = item.icon;
    icon.alt = "";
    icon.addEventListener("error", () => {
      icon.src = "chrome://global/skin/icons/defaultFavicon.svg";
    }, { once: true });

    let label = this._html("span");
    label.className = "vn-palette-label";
    label.textContent = item.label;

    let hint = this._html("span");
    hint.className = "vn-palette-hint";
    hint.textContent = item.hint;

    row.append(icon, label, hint);
    row.addEventListener("mousemove", () => this._select(index));
    row.addEventListener("click", () => this._run(index));
    return row;
  },

  _select(index) {
    let rows = this.panel.querySelectorAll(".vn-palette-item");
    if (!rows.length) {
      return;
    }
    this._selected = (index + rows.length) % rows.length;
    for (let row of rows) {
      let on = Number(row.dataset.index) == this._selected;
      row.setAttribute("aria-selected", on);
      if (on) {
        row.scrollIntoView({ block: "nearest" });
      }
    }
  },

  _onKey(event) {
    switch (event.key) {
      case "ArrowDown":
        this._select(this._selected + 1);
        break;
      case "ArrowUp":
        this._select(this._selected - 1);
        break;
      case "Enter":
        this._run(this._selected);
        break;
      case "Escape":
        this.panel.hidePopup();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  },

  _run(index) {
    let item = this._items[index];
    this.panel.hidePopup();
    if (item) {
      // После закрытия панели: иначе новое окно или меню открылось бы
      // под ещё не закрытой палитрой и потеряло бы фокус.
      setTimeout(() => item.run(), 0);
    }
  },
};

{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraPalette.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — журнал запросов.
 *
 * Панель показывает, куда страница отправляет запросы: какие адреса,
 * сколько раз, какие из них трекеры и что защита заблокировала. Щит
 * говорит «сколько», журнал — «куда именно».
 *
 * Источник — сетевой стек движка. Уведомления http-on-opening-request и
 * http-on-stop-request приходят в основной процесс по каждому HTTP-запросу
 * любой вкладки (nsHttpChannel.cpp). Запрос, остановленный защитой,
 * завершается с кодом блокировки (NS_ERROR_TRACKING_URI и соседние) —
 * по нему журнал отличает заблокированное от ушедшего в сеть.
 *
 * Журнал живёт только в памяти, отдельно для каждой вкладки, и
 * начинается заново при переходе на другую страницу. Он не пишется на
 * диск и не собирает историю: панель про эту страницу и сейчас.
 *
 * Любой адрес из журнала можно запретить одним нажатием — на всех сайтах
 * сразу (ui/modules/VantaraBlocklist.sys.mjs). Отчёт о странице
 * сохраняется в текстовый файл только по просьбе человека.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

var gVantaraLeaks = {
  WIDGET_ID: "vantara-leaks-button",
  VIEW_ID: "PanelUI-vantara-leaks",
  // Пока панель открыта, список обновляется не чаще этого: тяжёлая
  // страница делает сотни запросов в секунду.
  RENDER_DELAY_MS: 250,
  // Больше строк человек не прочтёт, а панель начнёт тормозить.
  MAX_ROWS: 150,

  // Коды, которыми защита Firefox останавливает запрос
  // (xpcom/base/ErrorList.py, «URL classifier»).
  BLOCKED_STATUSES: new Set([
    Cr.NS_ERROR_TRACKING_URI,
    Cr.NS_ERROR_FINGERPRINTING_URI,
    Cr.NS_ERROR_CRYPTOMINING_URI,
    Cr.NS_ERROR_SOCIALTRACKING_URI,
    Cr.NS_ERROR_EMAILTRACKING_URI,
  ]),

  // browser -> журнал. WeakMap: закрытая вкладка не держит память.
  _journals: new WeakMap(),
  _rows: new Map(),
  // Записи, изменившиеся с последней отрисовки.
  _dirty: null,
  _renderTimer: null,
  _viewShown: false,

  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  init() {
    this._blocklist = ChromeUtils.importESModule(
      "chrome://browser/content/vantara/modules/VantaraBlocklist.sys.mjs"
    ).VantaraBlocklist;
    this._blocklist.init();
    this._ensureView();
    this._registerWidget();
    Services.obs.addObserver(this, "http-on-opening-request");
    Services.obs.addObserver(this, "http-on-stop-request");
    gBrowser.addTabsProgressListener(this);
    gBrowser.tabContainer.addEventListener("TabSelect", this);
    window.addEventListener("unload", this, { once: true });
  },

  uninit() {
    Services.obs.removeObserver(this, "http-on-opening-request");
    Services.obs.removeObserver(this, "http-on-stop-request");
    gBrowser.removeTabsProgressListener(this);
    gBrowser.tabContainer.removeEventListener("TabSelect", this);
    clearTimeout(this._renderTimer);
  },

  handleEvent(event) {
    switch (event.type) {
      case "unload":
        this.uninit();
        break;
      case "TabSelect":
        if (this._viewShown) {
          this._renderAll();
        }
        break;
    }
  },

  /* --- Строки ------------------------------------------------------------ */

  STRINGS: {
    ru: {
      title: "Журнал запросов",
      tooltip: "Куда отправляет запросы эта страница",
      requests: { one: "запрос", few: "запроса", many: "запросов" },
      to: "к",
      hosts: { one: "адресу", few: "адресам", many: "адресам" },
      blocked: "заблокировано",
      empty: "Страница пока ничего не запрашивала.",
      notWeb: "Для этой страницы журнал не ведётся.",
      note: "Журнал хранится только в памяти и начинается заново на каждой странице.",
      badgeBlocked: "заблокирован",
      badgeTracker: "трекер",
      badgeThird: "сторонний",
      badgeFirst: "этот сайт",
      badgeDenied: "запрещён вами",
      more: "и ещё",
      deny: "Запретить",
      allow: "Разрешить",
      denyTitle: "Запретить запросы к {host} на всех сайтах",
      allowTitle: "Снова разрешить запросы к {host}",
      denied: "Запрещено вами",
      deniedEmpty: "Вы пока ничего не запрещали.",
      export: "Сохранить отчёт",
      exportTitle: "Сохранить отчёт о запросах этой страницы",
      reportTitle: "Журнал запросов Vantara",
      reportPage: "Страница",
      reportMade: "Составлен",
      reportHost: "Адрес",
      reportRequests: "Запросов",
      reportState: "Состояние",
      reportFile: "Текст",
    },
    en: {
      title: "Request log",
      tooltip: "Where this page sends requests",
      requests: { one: "request", other: "requests" },
      to: "to",
      hosts: { one: "host", other: "hosts" },
      blocked: "blocked",
      empty: "This page has not requested anything yet.",
      notWeb: "No log is kept for this page.",
      note: "Kept in memory only and started over on every page.",
      badgeBlocked: "blocked",
      badgeTracker: "tracker",
      badgeThird: "third-party",
      badgeFirst: "this site",
      badgeDenied: "blocked by you",
      more: "and",
      deny: "Block",
      allow: "Allow",
      denyTitle: "Block requests to {host} on every site",
      allowTitle: "Allow requests to {host} again",
      denied: "Blocked by you",
      deniedEmpty: "You have not blocked anything yet.",
      export: "Save report",
      exportTitle: "Save a report of this page's requests",
      reportTitle: "Vantara request log",
      reportPage: "Page",
      reportMade: "Made",
      reportHost: "Host",
      reportRequests: "Requests",
      reportState: "State",
      reportFile: "Text",
    },
  },

  get _lang() {
    return Services.locale.appLocaleAsBCP47.startsWith("ru") ? "ru" : "en";
  },

  _t(key) {
    return this.STRINGS[this._lang][key];
  },

  /** Слово в нужной форме: «1 запрос», «3 запроса», «5 запросов». */
  _plural(count, key) {
    let forms = this._t(key);
    let rule = new Intl.PluralRules(this._lang).select(count);
    return forms[rule] ?? forms.many ?? forms.other;
  },

  _number(count) {
    return count.toLocaleString(this._lang == "ru" ? "ru-RU" : "en-US");
  },

  /* --- Кнопка и панель --------------------------------------------------- */

  // Виджет общий на весь сеанс: CustomizableUI регистрирует его один раз,
  // а кнопки в окнах создаёт сам. Обработчики поэтому передают событие
  // журналу того окна, в котором открыта панель.
  //
  // Окно элемента в Firefox 156 — documentGlobal. Прежнее ownerGlobal
  // больше не существует и молча возвращает undefined.
  _registerWidget() {
    if (CustomizableUI.getWidget(this.WIDGET_ID)?.provider ==
        CustomizableUI.PROVIDER_API) {
      return;
    }
    CustomizableUI.createWidget({
      id: this.WIDGET_ID,
      type: "view",
      viewId: this.VIEW_ID,
      localized: false,
      label: this._t("title"),
      tooltiptext: this._t("tooltip"),
      defaultArea: CustomizableUI.AREA_NAVBAR,
      onBeforeCreated(doc) {
        doc.defaultView.gVantaraLeaks?._ensureView();
        return true;
      },
      onViewShowing(event) {
        event.target.documentGlobal.gVantaraLeaks.onViewShowing(event);
      },
      onViewHiding(event) {
        event.target.documentGlobal.gVantaraLeaks.onViewHiding(event);
      },
    });
  },

  // Панель хранится в шаблоне appMenu-viewCache, как панели самого
  // Firefox: PanelMultiView достаёт её оттуда при первом открытии.
  _ensureView() {
    if (PanelMultiView.getViewNode(document, this.VIEW_ID)) {
      return;
    }
    let cache = document.getElementById("appMenu-viewCache");
    if (!cache) {
      return;
    }
    let view = document.createXULElement("panelview");
    view.id = this.VIEW_ID;
    view.className = "PanelUI-subView";
    view.setAttribute("mainview-with-header", "true");

    let header = document.createXULElement("hbox");
    header.className = "panel-header";
    let title = this._html("h1");
    title.className = "vn-leaks-title";
    title.textContent = this._t("title");
    header.append(title);

    let separator = document.createXULElement("toolbarseparator");

    let body = document.createXULElement("vbox");
    body.className = "panel-subview-body vn-leaks";
    let summary = this._html("div");
    summary.className = "vn-leaks-summary";
    let list = this._html("ul");
    list.className = "vn-leaks-list";
    let footer = this._footer();
    let note = this._html("p");
    note.className = "vn-leaks-note";
    note.textContent = this._t("note");
    body.append(summary, list, footer, note);

    view.append(header, separator, body);
    cache.content.append(view);
  },

  _html(tag) {
    return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
  },

  onViewShowing() {
    this._viewShown = true;
    this._renderAll();
    this._renderFooter();
  },

  onViewHiding() {
    this._viewShown = false;
    clearTimeout(this._renderTimer);
    this._renderTimer = null;
  },

  /* --- Сбор ------------------------------------------------------------- */

  observe(subject, topic) {
    let channel;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch (e) {
      return;
    }
    let browser = this._browserFor(channel);
    if (!browser) {
      return;
    }
    if (topic == "http-on-opening-request") {
      this._onOpening(browser, channel);
    } else {
      this._onStop(browser, channel);
    }
  },

  // Вкладка этого окна, которой принадлежит запрос. Фоновые запросы
  // браузера (обновления списков, сертификаты) вкладки не имеют и в
  // журнал страницы не попадают.
  _browserFor(channel) {
    let id = channel.loadInfo?.browsingContextID;
    if (!id) {
      return null;
    }
    let browser = BrowsingContext.get(id)?.top?.embedderElement;
    if (!browser || browser.documentGlobal != window) {
      return null;
    }
    return browser;
  },

  _onOpening(browser, channel) {
    // TYPE_DOCUMENT — документ самой вкладки (у фреймов свой тип).
    // Новый документ — новый журнал. Переход по якорю HTTP-запроса не
    // делает и журнал не трогает.
    if (channel.loadInfo.externalContentPolicyType ==
        Ci.nsIContentPolicy.TYPE_DOCUMENT) {
      this._journals.set(browser, this._newJournal(channel.URI));
    }
    let journal = this._journals.get(browser);
    if (!journal) {
      return;
    }

    let entry = this._entryFor(journal, channel.URI);
    if (!entry) {
      return;
    }
    entry.requests++;
    journal.requests++;
    this._changed(browser, entry);
  },

  _onStop(browser, channel) {
    let journal = this._journals.get(browser);
    if (!journal) {
      return;
    }
    // Остановленный запрос движок завершает дважды: из самого канала и
    // из общего обработчика отмены. Считаем каждый канал один раз.
    let id = channel.QueryInterface(Ci.nsIIdentChannel).channelId;
    if (journal.finished.has(id)) {
      return;
    }
    journal.finished.add(id);
    let entry = this._entryFor(journal, channel.URI);
    if (!entry) {
      return;
    }

    let changed = false;
    // Перенаправленный запрос открывается без http-on-opening-request:
    // это новый адрес, и учитывается он при завершении.
    if (!entry.requests) {
      entry.requests++;
      journal.requests++;
      changed = true;
    }
    if (this.BLOCKED_STATUSES.has(channel.status) ||
        channel.status == this._blocklist.STATUS) {
      entry.blocked++;
      journal.blocked++;
      changed = true;
    }
    // Трекер, которого защита пропустила (например, в стандартном режиме
    // или по исключению для сайта), тоже должен быть виден.
    try {
      let classified = channel.QueryInterface(Ci.nsIClassifiedChannel);
      if (classified.thirdPartyClassificationFlags && !entry.tracker) {
        entry.tracker = true;
        changed = true;
      }
    } catch (e) {}

    if (changed) {
      this._changed(browser, entry);
    }
  },

  _newJournal(uri) {
    return {
      site: this._baseDomain(uri),
      hosts: new Map(),
      // Идентификаторы уже учтённых завершений (см. _onStop).
      finished: new Set(),
      requests: 0,
      blocked: 0,
    };
  },

  _entryFor(journal, uri) {
    let host;
    try {
      host = uri.host;
    } catch (e) {
      return null;
    }
    if (!host) {
      return null;
    }
    let entry = journal.hosts.get(host);
    if (!entry) {
      entry = {
        host,
        site: this._baseDomain(uri),
        requests: 0,
        blocked: 0,
        tracker: false,
      };
      journal.hosts.set(host, entry);
    }
    return entry;
  },

  // Сайт — домен второго уровня с учётом зон вроде co.uk. Для адресов
  // без зоны (IP, localhost) сайтом считается сам адрес.
  _baseDomain(uri) {
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch (e) {
      try {
        return uri.host;
      } catch (e2) {
        return "";
      }
    }
  },

  /* --- Отрисовка --------------------------------------------------------- */

  _changed(browser, entry) {
    if (!this._viewShown || browser != gBrowser.selectedBrowser) {
      return;
    }
    this._dirty ??= new Set();
    this._dirty.add(entry);
    if (!this._renderTimer) {
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._renderChanges();
      }, this.RENDER_DELAY_MS);
    }
  },

  _kind(entry, journal) {
    if (this._blocklist.isBlocked(entry.host)) {
      return "denied";
    }
    if (entry.blocked) {
      return "blocked";
    }
    if (entry.tracker) {
      return "tracker";
    }
    return entry.site == journal.site ? "first" : "third";
  },

  // Порядок: сначала то, что стоит внимания. Заблокированное и
  // пропущенные трекеры, затем сторонние адреса, свой сайт — в конце.
  _rank(kind) {
    return { tracker: 0, denied: 1, blocked: 1, third: 2, first: 3 }[kind];
  },

  _parts() {
    let view = PanelMultiView.getViewNode(document, this.VIEW_ID);
    return view && {
      summary: view.querySelector(".vn-leaks-summary"),
      list: view.querySelector(".vn-leaks-list"),
    };
  },

  // Полная перерисовка — при открытии панели и смене вкладки. Список
  // сортируется один раз: во время загрузки новые адреса добавляются
  // в конец, и строки не прыгают под курсором.
  _renderAll() {
    let parts = this._parts();
    if (!parts) {
      return;
    }
    this._dirty = null;
    this._rows.clear();
    parts.list.textContent = "";
    parts.list.removeAttribute("vn-truncated");

    let journal = this._journals.get(gBrowser.selectedBrowser);
    if (!journal) {
      parts.summary.textContent = this._t(
        gBrowser.currentURI.schemeIs("http") ||
          gBrowser.currentURI.schemeIs("https")
          ? "empty"
          : "notWeb"
      );
      return;
    }

    let entries = [...journal.hosts.values()].sort((a, b) =>
      this._rank(this._kind(a, journal)) - this._rank(this._kind(b, journal)) ||
      b.requests - a.requests ||
      a.host.localeCompare(b.host)
    );
    for (let entry of entries.slice(0, this.MAX_ROWS)) {
      parts.list.append(this._row(entry, journal, false));
    }
    this._renderSummary(parts, journal);
  },

  _renderChanges() {
    let parts = this._parts();
    let journal = this._journals.get(gBrowser.selectedBrowser);
    if (!parts || !journal || !this._dirty) {
      return;
    }
    for (let entry of this._dirty) {
      let row = this._rows.get(entry.host);
      if (row) {
        this._fillRow(row, entry, journal);
      } else if (this._rows.size < this.MAX_ROWS) {
        parts.list.append(this._row(entry, journal, true));
      }
    }
    this._dirty = null;
    this._renderSummary(parts, journal);
  },

  _renderSummary(parts, journal) {
    let { requests, blocked } = journal;
    let hosts = journal.hosts.size;
    let text =
      `${this._number(requests)} ${this._plural(requests, "requests")} ` +
      `${this._t("to")} ${this._number(hosts)} ${this._plural(hosts, "hosts")}`;
    parts.summary.textContent = requests ? text : this._t("empty");

    let blockedNode = this._html("b");
    if (blocked) {
      blockedNode.textContent = ` · ${this._t("blocked")} ${this._number(blocked)}`;
      parts.summary.append(blockedNode);
    }

    let hidden = hosts - this._rows.size;
    parts.list.toggleAttribute("vn-truncated", hidden > 0);
    if (hidden > 0) {
      parts.list.setAttribute(
        "vn-more",
        `${this._t("more")} ${this._number(hidden)} ${this._plural(hidden, "hosts")}`
      );
    }
  },

  _row(entry, journal, isNew) {
    let row = this._html("li");
    row.className = "vn-leaks-row";
    row.toggleAttribute("vn-new", isNew);

    let host = this._html("span");
    host.className = "vn-leaks-host";
    // Сайт выделен, поддомен приглушён: подмену домена видно сразу.
    let prefix = entry.host.slice(0, entry.host.length - entry.site.length);
    let base = this._html("b");
    base.textContent = entry.site || entry.host;
    host.append(prefix, base);
    host.title = entry.host;

    let badge = this._html("span");
    badge.className = "vn-leaks-badge";

    let count = this._html("span");
    count.className = "vn-leaks-count";

    // Кнопка запрета: видна под курсором, у запрещённого адреса — всегда,
    // чтобы разрешить его обратно было так же просто.
    let action = this._html("button");
    action.className = "vn-leaks-action";
    action.addEventListener("click", event => {
      event.stopPropagation();
      this._toggleBlock(entry.host);
    });

    row.append(host, badge, count, action);
    this._rows.set(entry.host, row);
    this._fillRow(row, entry, journal);
    return row;
  },

  _fillRow(row, entry, journal) {
    let kind = this._kind(entry, journal);
    let badge = row.querySelector(".vn-leaks-badge");
    badge.setAttribute("kind", kind);
    badge.textContent = this._t(
      { blocked: "badgeBlocked", tracker: "badgeTracker", denied: "badgeDenied",
        third: "badgeThird", first: "badgeFirst" }[kind]
    );
    row.querySelector(".vn-leaks-count").textContent = this._number(entry.requests);

    let action = row.querySelector(".vn-leaks-action");
    let denied = kind == "denied";
    // Запрещённый родительский адрес снимается целиком: иначе кнопка
    // «Разрешить» у поддомена ничего бы не делала.
    let target = denied ? this._blocklist.ruleFor(entry.host) : entry.host;
    action.textContent = this._t(denied ? "allow" : "deny");
    action.title = this._t(denied ? "allowTitle" : "denyTitle").replace("{host}", target);
    row.toggleAttribute("vn-denied", denied);
    // Адрес открытой страницы не запрещается: документ вкладки запрет
    // всё равно пропускает, а кнопка обещала бы то, чего не будет.
    action.hidden = !denied && entry.host == this._pageHost();
  },

  _pageHost() {
    try {
      return gBrowser.currentURI.host;
    } catch (e) {
      return "";
    }
  },

  _toggleBlock(host) {
    let rule = this._blocklist.ruleFor(host);
    if (rule) {
      this._blocklist.remove(rule);
    } else {
      this._blocklist.add(host);
    }
    this._refreshRows();
  },

  // Запрет меняет вид всех строк с этим адресом и его поддоменами.
  _refreshRows() {
    let journal = this._journals.get(gBrowser.selectedBrowser);
    if (journal) {
      for (let [host, row] of this._rows) {
        let entry = journal.hosts.get(host);
        if (entry) {
          this._fillRow(row, entry, journal);
        }
      }
    }
    this._renderFooter();
  },

  /* --- Подвал: запрещённое и отчёт --------------------------------------- */

  _footer() {
    let footer = this._html("div");
    footer.className = "vn-leaks-footer";

    let toggle = this._html("button");
    toggle.className = "vn-leaks-denied-toggle";
    toggle.addEventListener("click", () => {
      let list = footer.querySelector(".vn-leaks-denied");
      list.hidden = !list.hidden;
      toggle.toggleAttribute("vn-open", !list.hidden);
      this._renderFooter();
    });

    let save = this._html("button");
    save.className = "vn-leaks-export";
    save.textContent = this._t("export");
    save.title = this._t("exportTitle");
    save.addEventListener("click", () => this._exportReport());

    let bar = this._html("div");
    bar.className = "vn-leaks-footer-bar";
    bar.append(toggle, save);

    let list = this._html("ul");
    list.className = "vn-leaks-denied";
    list.hidden = true;

    footer.append(bar, list);
    return footer;
  },

  _renderFooter() {
    let view = PanelMultiView.getViewNode(document, this.VIEW_ID);
    if (!view) {
      return;
    }
    let hosts = this._blocklist.hosts;
    let toggle = view.querySelector(".vn-leaks-denied-toggle");
    toggle.textContent = `${this._t("denied")}: ${this._number(hosts.length)}`;

    let list = view.querySelector(".vn-leaks-denied");
    if (list.hidden) {
      return;
    }
    list.textContent = "";
    if (!hosts.length) {
      let empty = this._html("li");
      empty.className = "vn-leaks-denied-empty";
      empty.textContent = this._t("deniedEmpty");
      list.append(empty);
      return;
    }
    for (let host of hosts) {
      let item = this._html("li");
      item.className = "vn-leaks-row";
      let name = this._html("span");
      name.className = "vn-leaks-host";
      name.textContent = host;
      let allow = this._html("button");
      allow.className = "vn-leaks-action";
      allow.textContent = this._t("allow");
      allow.title = this._t("allowTitle").replace("{host}", host);
      allow.addEventListener("click", () => {
        this._blocklist.remove(host);
        this._refreshRows();
      });
      item.append(name, allow);
      list.append(item);
    }
  },

  /** Отчёт о запросах открытой страницы — в файл по выбору человека. */
  async _exportReport() {
    let journal = this._journals.get(gBrowser.selectedBrowser);
    if (!journal) {
      return;
    }
    let text = this._reportText(journal);

    let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window.browsingContext, this._t("export"), Ci.nsIFilePicker.modeSave);
    let day = new Date().toISOString().slice(0, 10);
    picker.defaultString = `vantara-${journal.site || "page"}-${day}.txt`;
    picker.defaultExtension = "txt";
    picker.appendFilter(this._t("reportFile"), "*.txt");
    let result = await new Promise(resolve => picker.open(resolve));
    if (result == Ci.nsIFilePicker.returnCancel || !picker.file) {
      return;
    }
    await IOUtils.writeUTF8(picker.file.path, text);
  },

  /** Текст отчёта: страница, итог и все адреса с состоянием. */
  _reportText(journal) {
    let page = gBrowser.currentURI.spec;
    let made = new Date().toLocaleString(this._lang == "ru" ? "ru-RU" : "en-US");
    let entries = [...journal.hosts.values()].sort((a, b) =>
      this._rank(this._kind(a, journal)) - this._rank(this._kind(b, journal)) ||
      b.requests - a.requests ||
      a.host.localeCompare(b.host)
    );
    let width = Math.max(this._t("reportHost").length,
                         ...entries.map(e => e.host.length)) + 2;
    let state = entry => this._t(
      { blocked: "badgeBlocked", tracker: "badgeTracker", denied: "badgeDenied",
        third: "badgeThird", first: "badgeFirst" }[this._kind(entry, journal)]
    );
    let lines = [
      this._t("reportTitle"),
      `${this._t("reportPage")}: ${page}`,
      `${this._t("reportMade")}: ${made}`,
      "",
      `${this._number(journal.requests)} ${this._plural(journal.requests, "requests")} ` +
        `${this._t("to")} ${this._number(journal.hosts.size)} ` +
        `${this._plural(journal.hosts.size, "hosts")} · ` +
        `${this._t("blocked")} ${this._number(journal.blocked)}`,
      "",
      this._t("reportHost").padEnd(width) +
        this._t("reportRequests").padStart(10) + "   " + this._t("reportState"),
      ...entries.map(e =>
        e.host.padEnd(width) + String(e.requests).padStart(10) + "   " + state(e)),
      "",
    ];
    // Окончания строк Windows: отчёт откроют в Блокноте.
    return lines.join("\r\n");
  },

  /* --- Слушатель прогресса --------------------------------------------- */

  // Страница без HTTP (about:, file:) запросов не делает — старый журнал
  // сбрасывается, чтобы панель не показывала чужие адреса.
  onLocationChange(browser, webProgress, request, location, flags) {
    if (!webProgress.isTopLevel ||
        flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
      return;
    }
    let journal = this._journals.get(browser);
    if (!location.schemeIs("http") && !location.schemeIs("https")) {
      this._journals.delete(browser);
    } else if (journal) {
      // После перенаправления сайт страницы — конечный адрес.
      journal.site = this._baseDomain(location);
    }
    if (this._viewShown && browser == gBrowser.selectedBrowser) {
      this._renderAll();
    }
  },
};

{
  let onStartup = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    gVantaraLeaks.init();
  };
  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

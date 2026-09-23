/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — адреса, запрещённые человеком.
 *
 * Журнал запросов (ui/scripts/vantara-leaks.js) показывает, куда уходит
 * страница, и из него же адрес запрещается одним нажатием. Список хранится
 * в настройке vantara.blocklist — адреса через пробел — и действует на всех
 * сайтах и во всех окнах сразу.
 *
 * Запрос к запрещённому адресу отменяется до отправки
 * (http-on-modify-request): соединение не открывается, данные не уходят.
 * Адрес закрывает и свои поддомены: запрет stats.example.com закрывает и
 * eu.stats.example.com. Сама страница, на которую человек переходит,
 * не блокируется никогда — иначе, запретив адрес в журнале, можно было бы
 * запереть себе сайт и не понять почему.
 *
 * Создаётся tools/sync-ui.py из ui/modules/. Править там.
 */

const PREF = "vantara.blocklist";

// Код отмены. По нему журнал отличает «запрещено вами» от блокировки
// защитой Firefox, у которой свои коды (NS_ERROR_TRACKING_URI и соседние).
const STATUS = Cr.NS_ERROR_CONTENT_BLOCKED;

let hosts = new Set();
let started = false;

function read() {
  hosts = new Set(
    Services.prefs.getStringPref(PREF, "").split(/\s+/).filter(Boolean)
  );
}

function write() {
  Services.prefs.setStringPref(PREF, [...hosts].sort().join(" "));
}

/** Запрещённый адрес, под который попадает host, или null. */
function match(host) {
  let name = host;
  while (name) {
    if (hosts.has(name)) {
      return name;
    }
    let dot = name.indexOf(".");
    if (dot < 0) {
      return null;
    }
    name = name.slice(dot + 1);
  }
  return null;
}

const observer = {
  observe(subject, topic) {
    if (topic == "nsPref:changed") {
      read();
      return;
    }
    if (!hosts.size) {
      return;
    }
    let channel;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch (e) {
      return;
    }
    let host;
    try {
      host = channel.URI.host;
    } catch (e) {
      return;
    }
    if (!host || !match(host)) {
      return;
    }
    // Документ самой вкладки — туда человек решил перейти сам.
    if (
      channel.loadInfo?.externalContentPolicyType ==
      Ci.nsIContentPolicy.TYPE_DOCUMENT
    ) {
      return;
    }
    channel.cancel(STATUS);
  },
};

export const VantaraBlocklist = {
  STATUS,

  /** Подключается один раз на весь браузер; повторные вызовы ничего не делают. */
  init() {
    if (started) {
      return;
    }
    started = true;
    read();
    Services.prefs.addObserver(PREF, observer);
    Services.obs.addObserver(observer, "http-on-modify-request");
  },

  get hosts() {
    return [...hosts].sort();
  },

  isBlocked(host) {
    return !!match(host);
  },

  /** Запись списка, из-за которой запрещён host: он сам или его родитель. */
  ruleFor(host) {
    return match(host);
  },

  add(host) {
    hosts.add(host);
    write();
  },

  remove(host) {
    hosts.delete(host);
    write();
  },
};

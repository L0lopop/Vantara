/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — строгая защита от слежки на новом профиле.
 *
 * Почему не заводской настройкой. Firefox применяет категорию защиты,
 * только если она выставлена пользователем (ContentBlockingPrefs:
 * updateCBCategory). Заводское значение он не трогает, а при старте
 * сверяет настройки: если ни одна не выставлена пользователем, категория
 * объявляется «стандартной». Заводское "strict" превращается в "standard"
 * при первом же запуске — проверено на сборке.
 *
 * Официальный путь — корпоративная политика. Но любая политика включает в
 * настройках плашку «браузером управляет ваша организация», а для личного
 * браузера это неправда.
 *
 * Поэтому категория выставляется один раз, на новом профиле, как
 * пользовательское значение. Дальше Firefox сам применяет весь строгий
 * набор (browser.contentblocking.features.strict), включая очистку ссылок
 * от меток слежки и защиту от bounce-трекинга. Если пользователь потом
 * выберет «стандартную», он получит настоящий стандарт Firefox — например,
 * чтобы починить сайт, — и мы это решение не отменяем.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

{
  const CATEGORY_PREF = "browser.contentblocking.category";
  const APPLIED_PREF = "vantara.protection.initialCategoryApplied";
  const INITIAL_CATEGORY = "strict";

  let applyOnce = subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(applyOnce, "browser-delayed-startup-finished");

    // Флаг ставится один раз на профиль. Проверка в каждом окне безвредна:
    // два окна, открытые одновременно, выставят одно и то же значение.
    if (Services.prefs.getBoolPref(APPLIED_PREF, false)) {
      return;
    }

    // "standard" на профиле без нашего флага почти всегда выставлен самим
    // Firefox: модуль защиты при старте записывает его автоматически, как
    // пользовательское значение. Отличить это от осознанного выбора по
    // одному значению нельзя, поэтому "standard" переписываем.
    //
    // "strict" и "custom" оставляем: это либо уже нужный режим, либо
    // ручная настройка — например, в профиле, перенесённом из Firefox.
    let current = Services.prefs.getStringPref(CATEGORY_PREF, "");
    if (current == "" || current == "standard") {
      Services.prefs.setStringPref(CATEGORY_PREF, INITIAL_CATEGORY);
    }
    Services.prefs.setBoolPref(APPLIED_PREF, true);
  };

  Services.obs.addObserver(applyOnce, "browser-delayed-startup-finished");
}

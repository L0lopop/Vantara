/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — поисковая система по умолчанию на новом профиле.
 *
 * Firefox выбирает поиск по умолчанию сам, по стране и языку, из списка
 * поисковых систем (search-config-v2). Почти везде это Google: каждый
 * запрос из адресной строки уходит системе, которая строит по ним профиль.
 * Новая вкладка Vantara при этом ищет через DuckDuckGo — два разных поиска
 * в одном окне.
 *
 * Заводской настройкой это не решить: такой настройки в Firefox больше нет,
 * а корпоративная политика SearchEngines работает только в ESR и включает
 * плашку «браузером управляет организация».
 *
 * Поэтому, как и со строгой защитой (vantara-protection.js), выбор делается
 * один раз на новом профиле. Он сохраняется как обычный выбор поиска —
 * пользователь меняет его в настройках, и мы это решение не отменяем.
 * Профиль, где поиск уже выбран вручную (например, перенесённый из
 * Firefox), не трогаем.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

{
  const APPLIED_PREF = "vantara.search.initialDefaultApplied";
  // Идентификатор из search-config-v2: DuckDuckGo есть в списке для всех
  // стран и языков.
  const ENGINE_ID = "ddg";

  // В окне браузера сервис поиска глобально не объявлен (Services.search
  // в Firefox 156 уже нет) — модуль подключается явно.
  const { SearchService } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/search/SearchService.sys.mjs"
  );

  let applyOnce = async subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(applyOnce, "browser-delayed-startup-finished");

    if (Services.prefs.getBoolPref(APPLIED_PREF, false)) {
      return;
    }
    // Флаг ставится до ожидания инициализации поиска: второе окно,
    // открытое в это время, не должно повторить работу.
    Services.prefs.setBoolPref(APPLIED_PREF, true);

    try {
      await SearchService.init();

      // Поиск, отличный от выбранного Firefox по стране, выбрал человек.
      if (SearchService.defaultEngine != SearchService.appDefaultEngine) {
        return;
      }

      let engine = SearchService.getEngineById(ENGINE_ID);
      if (!engine) {
        console.error(`Vantara: поисковая система ${ENGINE_ID} не найдена`);
        return;
      }
      await SearchService.setDefault(
        engine,
        SearchService.CHANGE_REASON.UNKNOWN
      );
    } catch (error) {
      console.error("Vantara: поиск по умолчанию не выставлен", error);
    }
  };

  Services.obs.addObserver(applyOnce, "browser-delayed-startup-finished");
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — поиск по умолчанию.
 *
 * Поиск по умолчанию — Google. Firefox выбирает систему по стране и языку,
 * поэтому скрипт ставит Google явно, один раз на профиль. Выбор сохраняется
 * как обычный выбор в настройках: пользователь меняет его там, и мы это
 * решение не отменяем.
 *
 * Версии решения:
 *   1 — ставился DuckDuckGo;
 *   2 — Google. Профиль с версией 1, где по-прежнему DuckDuckGo, переводится
 *       на Google: этот выбор сделали мы, а не человек. Любой другой
 *       выбранный поиск остаётся.
 *
 * Второе дело скрипта — сообщать новой вкладке, куда отправлять запрос.
 * Страница работает в отдельном процессе и не видит сервис поиска, поэтому
 * имя системы и адрес запроса (с {q} вместо текста) лежат в настройках
 * vantara.search.engineName и vantara.search.urlTemplate.
 *
 * Создаётся tools/sync-ui.py из ui/scripts/. Править там.
 */

"use strict";

{
  const VERSION_PREF = "vantara.search.defaultVersion";
  const LEGACY_PREF = "vantara.search.initialDefaultApplied";
  const VERSION = 2;
  const ENGINE_ID = "google";
  const PREVIOUS_ENGINE_ID = "ddg";
  const NAME_PREF = "vantara.search.engineName";
  const TEMPLATE_PREF = "vantara.search.urlTemplate";
  // Заглушка текста запроса: её место в адресе становится {q}.
  const PLACEHOLDER = "VANTARAQUERY";

  // В окне браузера сервис поиска глобально не объявлен (Services.search
  // в Firefox 156 уже нет) — модуль подключается явно.
  const { SearchService } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/search/SearchService.sys.mjs"
  );

  async function applyDefault() {
    let version = Services.prefs.getIntPref(VERSION_PREF, 0);
    if (!version && Services.prefs.getBoolPref(LEGACY_PREF, false)) {
      version = 1;
    }
    if (version >= VERSION) {
      return;
    }
    // Версия ставится до ожидания сервиса: второе окно, открытое в это
    // время, не должно повторить работу.
    Services.prefs.setIntPref(VERSION_PREF, VERSION);
    Services.prefs.clearUserPref(LEGACY_PREF);

    let current = SearchService.defaultEngine;
    let untouched =
      version == 0
        ? current == SearchService.appDefaultEngine
        : current?.id == PREVIOUS_ENGINE_ID;
    if (!untouched) {
      return;
    }

    let engine = SearchService.getEngineById(ENGINE_ID);
    if (!engine) {
      console.error(`Vantara: поисковая система ${ENGINE_ID} не найдена`);
      return;
    }
    await SearchService.setDefault(engine, SearchService.CHANGE_REASON.UNKNOWN);
  }

  function publishTemplate() {
    let engine = SearchService.defaultEngine;
    let url = engine?.getSubmission(PLACEHOLDER)?.uri?.spec;
    if (!url) {
      return;
    }
    Services.prefs.setStringPref(NAME_PREF, engine.name);
    Services.prefs.setStringPref(TEMPLATE_PREF, url.replace(PLACEHOLDER, "{q}"));
  }

  let onEngineChanged = (subject, topic, data) => {
    if (data == "engine-default") {
      publishTemplate();
    }
  };

  let onStartup = async subject => {
    if (subject != window) {
      return;
    }
    Services.obs.removeObserver(onStartup, "browser-delayed-startup-finished");
    try {
      await SearchService.init();
      await applyDefault();
      publishTemplate();
    } catch (error) {
      console.error("Vantara: поиск по умолчанию не выставлен", error);
    }
    Services.obs.addObserver(onEngineChanged, "browser-search-engine-modified");
    window.addEventListener(
      "unload",
      () => Services.obs.removeObserver(onEngineChanged, "browser-search-engine-modified"),
      { once: true }
    );
  };

  Services.obs.addObserver(onStartup, "browser-delayed-startup-finished");
}

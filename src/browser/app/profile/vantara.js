/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Vantara — заводские настройки.
 * Создаётся tools/sync-ui.py из ui/prefs/user.js. Править там.
 *
 * Файл читается после firefox.js (порядок алфавитный) и перекрывает
 * его значения. Он проходит через препроцессор сборки, поэтому строка
 * не может начинаться с символа решётки. */

/* ==========================================================================
 * Vantara - базовая конфигурация приватности
 * --------------------------------------------------------------------------
 * В прототипе этот файл кладётся в профиль как user.js.
 * В сборке форка те же значения становятся заводскими дефолтами
 * (browser/app/profile/vantara.js), и пользователь может их менять.
 *
 * Пометки:
 *   [ЛОМАЕТ]  - заметно ломает часть сайтов, включено осознанно.
 *   [РИСК]    - ослабляет другую защиту, читать комментарий целиком.
 *   [РЕШИТЬ]  - политика ещё не утверждена, см. docs/PRIVACY.md.
 * ========================================================================== */

/* == 1. Телеметрия и отчёты ================================================
 * Vantara не собирает статистику использования. Ни в каком виде,
 * ни анонимно, ни "для улучшения продукта". Каналы Mozilla глушим все,
 * потому что форк наследует их конфигурацию целиком.
 * ========================================================================== */
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("toolkit.telemetry.newProfilePing.enabled", false);
pref("toolkit.telemetry.updatePing.enabled", false);
pref("toolkit.telemetry.shutdownPingSender.enabled", false);
pref("toolkit.telemetry.bhrPing.enabled", false);
pref("toolkit.telemetry.firstShutdownPing.enabled", false);
pref("toolkit.coverage.opt-out", true);
pref("browser.ping-centre.telemetry", false);
pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
pref("browser.newtabpage.activity-stream.telemetry", false);
pref("app.shield.optoutstudies.enabled", false);
pref("app.normandy.enabled", false);
pref("app.normandy.api_url", "");
pref("browser.discovery.enabled", false);
pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);
pref("breakpad.reportURL", "");

/* == 2. Блокировка слежки ==================================================
 * Строгий режим: трекеры, соцкнопки, майнеры, сбор отпечатков.
 * ========================================================================== */
pref("browser.contentblocking.category", "strict");
pref("privacy.trackingprotection.enabled", true);
pref("privacy.trackingprotection.pbmode.enabled", true);
pref("privacy.trackingprotection.socialtracking.enabled", true);
pref("privacy.trackingprotection.cryptomining.enabled", true);
pref("privacy.trackingprotection.fingerprinting.enabled", true);
pref("privacy.trackingprotection.emailtracking.enabled", true);

/* == 3. Изоляция состояния =================================================
 * cookieBehavior 5 - Total Cookie Protection: каждый сторонний ресурс
 * получает отдельную "банку" кук на каждый сайт верхнего уровня.
 * Межсайтовое отслеживание через куки перестаёт работать, при этом
 * логины на самих сайтах не ломаются.
 *
 * [РИСК] privacy.firstparty.isolate НЕ включаем: он конфликтует с TCP
 * и даёт менее удобный результат при той же по сути защите.
 * ========================================================================== */
pref("network.cookie.cookieBehavior", 5);
pref("privacy.partition.network_state", true);
pref("privacy.partition.serviceWorkers", true);
pref("privacy.partition.always_partition_third_party_non_cookie_storage", true);
pref("privacy.firstparty.isolate", false);

/* == 4. Защита от снятия отпечатка =========================================
 * Две независимые системы:
 *   fingerprintingProtection - точечная, ломает мало, включаем всегда.
 *   resistFingerprinting (RFP) - агрессивная: подменяет часовой пояс,
 *   язык, размер окна, отключает часть API.
 *
 * [ЛОМАЕТ] RFP заметен пользователю: окно открывается "ступенчатого"
 * размера, время показывается по UTC. Поэтому в Vantara он станет
 * переключателем уровня защиты в интерфейсе, а не молчаливым дефолтом.
 * [РЕШИТЬ] уровень по умолчанию - см. docs/PRIVACY.md, раздел "Уровни".
 * ========================================================================== */
pref("privacy.fingerprintingProtection", true);
pref("privacy.fingerprintingProtection.pbmode", true);
pref("privacy.resistFingerprinting", false);
pref("privacy.resistFingerprinting.letterboxing", false);
pref("privacy.resistFingerprinting.block_mozAddonManager", true);
pref("webgl.disabled", false);            /* [ЛОМАЕТ] если включить */
pref("media.navigator.enabled", true);    /* камера/микрофон по запросу */

/* == 5. Сеть: утечки и предугадывание ======================================
 * Браузер не должен ходить в сеть за тем, что пользователь не запрашивал.
 * ========================================================================== */
pref("network.prefetch-next", false);
pref("network.dns.disablePrefetch", true);
pref("network.dns.disablePrefetchFromHTTPS", true);
pref("network.predictor.enabled", false);
pref("network.predictor.enable-prefetch", false);
pref("network.http.speculative-parallel-limit", 0);
pref("browser.places.speculativeConnect.enabled", false);
pref("browser.urlbar.speculativeConnect.enabled", false);
pref("browser.send_pings", false);
pref("beacon.enabled", false);

/* Referer: сторонним сайтам отдаём только источник, без пути и параметров. */
pref("network.http.referer.XOriginPolicy", 2);
pref("network.http.referer.XOriginTrimmingPolicy", 2);

/* WebRTC: не отключаем целиком (сломает звонки), но запрещаем раскрывать
 * локальные адреса - именно через них утекает реальный IP из-под VPN. */
pref("media.peerconnection.ice.default_address_only", true);
pref("media.peerconnection.ice.no_host", true);

pref("geo.enabled", false);
pref("permissions.default.geo", 2);

/* == 6. Транспорт: HTTPS и DNS =============================================
 * HTTPS-only - открытым текстом не ходим никуда. Страница-заглушка
 * позволяет продолжить вручную, если сайт правда без TLS.
 *
 * [РЕШИТЬ] DoH: режим 2 (с откатом на системный DNS) безопасен по
 * умолчанию, но владелец резолвера видит все домены. Свой резолвер и
 * выбор провайдера в интерфейсе - задача этапа 4 роадмапа.
 * ========================================================================== */
pref("dom.security.https_only_mode", true);
pref("dom.security.https_only_mode_ever_enabled", true);
pref("network.trr.mode", 2);
pref("security.tls.version.min", 3);          /* TLS 1.2 минимум */
pref("security.ssl.require_safe_negotiation", true);
pref("security.OCSP.enabled", 1);
pref("security.cert_pinning.enforcement_level", 2);

/* == 7. Безопасный просмотр ================================================
 * [РИСК] Полное отключение Safe Browsing убирает защиту от фишинга -
 * это реальный ущерб пользователю ради сомнительной приватности.
 * Держим локальные списки включёнными, но запрещаем запросы к Google
 * по конкретным загрузкам, где уходит хеш файла и его источник.
 * ========================================================================== */
pref("browser.safebrowsing.malware.enabled", true);
pref("browser.safebrowsing.phishing.enabled", true);
pref("browser.safebrowsing.downloads.remote.enabled", false);
pref("browser.safebrowsing.downloads.remote.block_potentially_unwanted", false);

/* == 8. Хранение данных и сессия ===========================================
 * privacy_level 2 - в файл сессии не пишутся данные форм и сохранённые
 * поля, поэтому их нельзя достать с диска после закрытия браузера.
 * ========================================================================== */
pref("browser.sessionstore.privacy_level", 2);
pref("browser.formfill.enable", false);
pref("signon.autofillForms", false);
pref("signon.formlessCapture.enabled", false);
pref("extensions.formautofill.addresses.enabled", false);
pref("extensions.formautofill.creditCards.enabled", false);

/* [РЕШИТЬ] Очистка при выходе - политика по умолчанию не утверждена.
 * Включённая очистка = каждый запуск с нуля, разлогин везде.
 * Оставляем выключенной, но готовой к включению одним переключателем. */
pref("privacy.sanitize.sanitizeOnShutdown", false);
pref("privacy.clearOnShutdown_v2.cookiesAndStorage", false);
pref("privacy.clearOnShutdown_v2.historyFormDataAndDownloads", false);
pref("privacy.clearOnShutdown_v2.cache", true);

/* == 9. Интерфейс и внешние сервисы ========================================
 * Всё, что ходит в сеть ради рекомендаций и рекламы, - выключено.
 * ========================================================================== */
pref("extensions.pocket.enabled", false);
pref("extensions.htmlaboutaddons.recommendations.enabled", false);
pref("extensions.getAddons.showPane", false);
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.newtabpage.activity-stream.feeds.discoverystreamfeed", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.urlbar.trending.featureGate", false);
pref("browser.topsites.contile.enabled", false);

/* == 9a. Обновления ========================================================
 * Проверка обновлений — это сетевой запрос, по которому владелец сервера
 * узнаёт о каждом запуске браузера: версию, платформу, примерное время.
 * У Firefox этот сервер принадлежит Mozilla, и форк унаследовал бы его.
 *
 * В сборке адрес заменён на домен в зоне .invalid, который не резолвится
 * по стандарту (RFC 2606) — см. src/build/moz-build.patch. Автопроверка
 * при этом выключена: незачем ходить в сеть за тем, чего там нет.
 *
 * До появления своего канала обновлений выпуски забираются вручную:
 * https://github.com/L0lopop/Vantara/releases
 *
 * [РЕШИТЬ] Свой сервер обновлений с подписью сборок — этап 5 роадмапа.
 * Пока его нет, пользователь не получает исправления безопасности
 * автоматически, и это честно сказано в README.
 * ========================================================================== */
pref("app.update.auto", false);
pref("app.update.background.enabled", false);
pref("app.update.checkInstallTime", false);
pref("app.update.service.enabled", false);

/* == 10. Первый запуск =====================================================
 * Firefox на первом старте открывает mozilla.org и показывает экран
 * согласия с отправкой «данных диагностики и взаимодействия». То есть
 * браузер выходит в сеть и заводит разговор о телеметрии раньше, чем
 * пользователь успел что-либо открыть.
 *
 * Vantara не собирает телеметрию вовсе, поэтому и согласия спрашивать не о
 * чем, и ходить за приветственной страницей некуда. Первый запуск должен
 * быть неотличим от любого следующего: пустая вкладка, ноль запросов.
 * ========================================================================== */
pref("browser.preonboarding.enabled", false);          /* экран «Условия использования» */
pref("browser.aboutwelcome.enabled", false);           /* обучающий экран */
pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
pref("browser.startup.firstrunSkipsHomepage", true);
pref("startup.homepage_welcome_url", "");
pref("startup.homepage_welcome_url.additional", "");
pref("startup.homepage_override_url", "");
pref("browser.startup.homepage_override.mstone", "ignore");  /* нет «что нового» после обновления */
pref("browser.messaging-system.whatsNewPanel.enabled", false);
pref("browser.shell.checkDefaultBrowser", false);
pref("browser.rights.3.shown", true);
pref("toolkit.telemetry.reportingpolicy.firstRun", false);

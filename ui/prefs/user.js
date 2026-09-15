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
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("toolkit.telemetry.archive.enabled", false);
user_pref("toolkit.telemetry.newProfilePing.enabled", false);
user_pref("toolkit.telemetry.updatePing.enabled", false);
user_pref("toolkit.telemetry.shutdownPingSender.enabled", false);
user_pref("toolkit.telemetry.bhrPing.enabled", false);
user_pref("toolkit.telemetry.firstShutdownPing.enabled", false);
user_pref("toolkit.coverage.opt-out", true);
user_pref("browser.ping-centre.telemetry", false);
user_pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
user_pref("browser.newtabpage.activity-stream.telemetry", false);
user_pref("app.shield.optoutstudies.enabled", false);
user_pref("app.normandy.enabled", false);
user_pref("app.normandy.api_url", "");
user_pref("browser.discovery.enabled", false);
user_pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);
user_pref("breakpad.reportURL", "");

/* == 2. Блокировка слежки ==================================================
 * Строгий режим: трекеры, соцкнопки, майнеры, сбор отпечатков.
 * ========================================================================== */
user_pref("browser.contentblocking.category", "strict");
user_pref("privacy.trackingprotection.enabled", true);
user_pref("privacy.trackingprotection.pbmode.enabled", true);
user_pref("privacy.trackingprotection.socialtracking.enabled", true);
user_pref("privacy.trackingprotection.cryptomining.enabled", true);
user_pref("privacy.trackingprotection.fingerprinting.enabled", true);
user_pref("privacy.trackingprotection.emailtracking.enabled", true);

/* == 3. Изоляция состояния =================================================
 * cookieBehavior 5 - Total Cookie Protection: каждый сторонний ресурс
 * получает отдельную "банку" кук на каждый сайт верхнего уровня.
 * Межсайтовое отслеживание через куки перестаёт работать, при этом
 * логины на самих сайтах не ломаются.
 *
 * [РИСК] privacy.firstparty.isolate НЕ включаем: он конфликтует с TCP
 * и даёт менее удобный результат при той же по сути защите.
 * ========================================================================== */
user_pref("network.cookie.cookieBehavior", 5);
user_pref("privacy.partition.network_state", true);
user_pref("privacy.partition.serviceWorkers", true);
user_pref("privacy.partition.always_partition_third_party_non_cookie_storage", true);
user_pref("privacy.firstparty.isolate", false);

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
user_pref("privacy.fingerprintingProtection", true);
user_pref("privacy.fingerprintingProtection.pbmode", true);
user_pref("privacy.resistFingerprinting", false);
user_pref("privacy.resistFingerprinting.letterboxing", false);
user_pref("privacy.resistFingerprinting.block_mozAddonManager", true);
user_pref("webgl.disabled", false);            /* [ЛОМАЕТ] если включить */
user_pref("media.navigator.enabled", true);    /* камера/микрофон по запросу */

/* == 5. Сеть: утечки и предугадывание ======================================
 * Браузер не должен ходить в сеть за тем, что пользователь не запрашивал.
 * ========================================================================== */
user_pref("network.prefetch-next", false);
user_pref("network.dns.disablePrefetch", true);
user_pref("network.dns.disablePrefetchFromHTTPS", true);
user_pref("network.predictor.enabled", false);
user_pref("network.predictor.enable-prefetch", false);
user_pref("network.http.speculative-parallel-limit", 0);
user_pref("browser.places.speculativeConnect.enabled", false);
user_pref("browser.urlbar.speculativeConnect.enabled", false);
user_pref("browser.send_pings", false);
user_pref("beacon.enabled", false);

/* Referer: сторонним сайтам отдаём только источник, без пути и параметров. */
user_pref("network.http.referer.XOriginPolicy", 2);
user_pref("network.http.referer.XOriginTrimmingPolicy", 2);

/* WebRTC: не отключаем целиком (сломает звонки), но запрещаем раскрывать
 * локальные адреса - именно через них утекает реальный IP из-под VPN. */
user_pref("media.peerconnection.ice.default_address_only", true);
user_pref("media.peerconnection.ice.no_host", true);

user_pref("geo.enabled", false);
user_pref("permissions.default.geo", 2);

/* == 6. Транспорт: HTTPS и DNS =============================================
 * HTTPS-only - открытым текстом не ходим никуда. Страница-заглушка
 * позволяет продолжить вручную, если сайт правда без TLS.
 *
 * [РЕШИТЬ] DoH: режим 2 (с откатом на системный DNS) безопасен по
 * умолчанию, но владелец резолвера видит все домены. Свой резолвер и
 * выбор провайдера в интерфейсе - задача этапа 4 роадмапа.
 * ========================================================================== */
user_pref("dom.security.https_only_mode", true);
user_pref("dom.security.https_only_mode_ever_enabled", true);
user_pref("network.trr.mode", 2);
user_pref("security.tls.version.min", 3);          /* TLS 1.2 минимум */
user_pref("security.ssl.require_safe_negotiation", true);
user_pref("security.OCSP.enabled", 1);
user_pref("security.cert_pinning.enforcement_level", 2);

/* == 7. Безопасный просмотр ================================================
 * [РИСК] Полное отключение Safe Browsing убирает защиту от фишинга -
 * это реальный ущерб пользователю ради сомнительной приватности.
 * Держим локальные списки включёнными, но запрещаем запросы к Google
 * по конкретным загрузкам, где уходит хеш файла и его источник.
 * ========================================================================== */
user_pref("browser.safebrowsing.malware.enabled", true);
user_pref("browser.safebrowsing.phishing.enabled", true);
user_pref("browser.safebrowsing.downloads.remote.enabled", false);
user_pref("browser.safebrowsing.downloads.remote.block_potentially_unwanted", false);

/* == 8. Хранение данных и сессия ===========================================
 * privacy_level 2 - в файл сессии не пишутся данные форм и сохранённые
 * поля, поэтому их нельзя достать с диска после закрытия браузера.
 * ========================================================================== */
user_pref("browser.sessionstore.privacy_level", 2);
user_pref("browser.formfill.enable", false);
user_pref("signon.autofillForms", false);
user_pref("signon.formlessCapture.enabled", false);
user_pref("extensions.formautofill.addresses.enabled", false);
user_pref("extensions.formautofill.creditCards.enabled", false);

/* [РЕШИТЬ] Очистка при выходе - политика по умолчанию не утверждена.
 * Включённая очистка = каждый запуск с нуля, разлогин везде.
 * Оставляем выключенной, но готовой к включению одним переключателем. */
user_pref("privacy.sanitize.sanitizeOnShutdown", false);
user_pref("privacy.clearOnShutdown_v2.cookiesAndStorage", false);
user_pref("privacy.clearOnShutdown_v2.historyFormDataAndDownloads", false);
user_pref("privacy.clearOnShutdown_v2.cache", true);

/* == 9. Интерфейс и внешние сервисы ========================================
 * Всё, что ходит в сеть ради рекомендаций и рекламы, - выключено.
 * ========================================================================== */
user_pref("extensions.pocket.enabled", false);
user_pref("extensions.htmlaboutaddons.recommendations.enabled", false);
user_pref("extensions.getAddons.showPane", false);
user_pref("browser.newtabpage.activity-stream.showSponsored", false);
user_pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
user_pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
user_pref("browser.newtabpage.activity-stream.feeds.discoverystreamfeed", false);
user_pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
user_pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
user_pref("browser.urlbar.trending.featureGate", false);
user_pref("browser.topsites.contile.enabled", false);

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
user_pref("browser.preonboarding.enabled", false);          /* экран «Условия использования» */
user_pref("browser.aboutwelcome.enabled", false);           /* обучающий экран */
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("browser.startup.firstrunSkipsHomepage", true);
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("startup.homepage_override_url", "");
user_pref("browser.startup.homepage_override.mstone", "ignore");  /* нет «что нового» после обновления */
user_pref("browser.messaging-system.whatsNewPanel.enabled", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.rights.3.shown", true);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);

/* == 11. Прототипирование интерфейса =======================================
 * Нужны, чтобы userChrome.css вообще применялся к готовому Firefox.
 * В собранном форке не требуются: стили там часть пакета.
 *
 * Важно: этот флаг начинает действовать только со следующего запуска.
 * На только что созданном профиле интерфейс останется стандартным —
 * dev-profile.ps1 из-за этого делает короткий прогревочный запуск.
 * ========================================================================== */
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.uidensity", 0);

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
 * Строгий режим: трекеры, соцкнопки, майнеры, сбор отпечатков, Total Cookie
 * Protection, очистка ссылок от меток слежки, защита от bounce-трекинга.
 *
 * Отдельные настройки этих защит здесь НЕ задаются — ими командует
 * категория. Firefox сам выставляет весь набор по
 * browser.contentblocking.features.strict. Задать их заводскими значениями
 * значило бы сломать выбор пользователя: переключившись на «стандартную»,
 * чтобы починить сайт, он получил бы наш строгий набор под чужой вывеской.
 *
 * В сборке категория не может быть заводским значением — Firefox его
 * игнорирует и при старте объявляет «стандартной». На новом профиле её
 * выставляет ui/scripts/vantara-protection.js; в заводские настройки эта
 * строка не переносится (см. tools/sync-ui.py). Здесь она для прототипа.
 * ========================================================================== */

/* Счётчик заблокированных трекеров в адресной строке. В Firefox он есть,
 * но выключен и включается удалённым экспериментом: флаг живёт в системе
 * Nimbus, у контрольной группы он false. Удалённые эксперименты у нас
 * отключены, поэтому сам он не включится никогда — включаем для всех.
 * Функции защиты не должны раздаваться выборочно по жребию. */
pref("browser.urlbar.trackerCount.featureGate", true);
pref("browser.urlbar.trackerCount.enabled", true);

/* == 3. Изоляция состояния =================================================
 * Total Cookie Protection (cookieBehavior 5) включает категория из
 * секции 2: каждый сторонний ресурс получает отдельную "банку" кук на
 * каждый сайт верхнего уровня. Здесь — то, что к категории не относится.
 *
 * [РИСК] privacy.firstparty.isolate НЕ включаем: он конфликтует с TCP
 * и даёт менее удобный результат при той же по сути защите.
 * ========================================================================== */
pref("privacy.partition.network_state", true);
pref("privacy.partition.serviceWorkers", true);
pref("privacy.partition.always_partition_third_party_non_cookie_storage", true);
pref("privacy.firstparty.isolate", false);

/* == 4. Защита от снятия отпечатка =========================================
 * Две независимые системы:
 *   fingerprintingProtection - точечная, ломает мало. Её включает
 *   категория из секции 2 (fpp, fppPrivate), здесь не задаётся.
 *   resistFingerprinting (RFP) - агрессивная: подменяет часовой пояс,
 *   язык, размер окна, отключает часть API.
 *
 * [ЛОМАЕТ] RFP заметен пользователю: окно открывается "ступенчатого"
 * размера, время показывается по UTC. Поэтому в Vantara он станет
 * переключателем уровня защиты в интерфейсе, а не молчаливым дефолтом.
 * [РЕШИТЬ] уровень по умолчанию - см. docs/PRIVACY.md, раздел "Уровни".
 * ========================================================================== */
pref("privacy.resistFingerprinting", false);
pref("privacy.resistFingerprinting.letterboxing", false);
pref("privacy.resistFingerprinting.block_mozAddonManager", true);
pref("webgl.disabled", false);            /* [ЛОМАЕТ] если включить */
pref("media.navigator.enabled", true);    /* камера/микрофон по запросу */

/* == 5. Сеть: утечки и предугадывание ======================================
 * Браузер не скачивает страницы, которые пользователь не открывал.
 *
 * Предварительные соединения при этом включены — это цена скорости,
 * названная честно. Когда курсор над ссылкой или адрес набирается,
 * браузер заранее выясняет адрес сайта и открывает к нему соединение.
 * Сайт видит, что к нему подключились, но не получает ни запроса, ни
 * куки. Без этого каждый переход ждал лишние 100-300 мс, и поиск с
 * переходами по результатам ощутимо тормозил. Адреса при этом уходят
 * через DNS-через-HTTPS (секция 6), а не провайдеру открытым текстом.
 *
 * Выключенным остаётся то, что действительно раскрывает поведение:
 * предзагрузка следующих страниц и «предсказатель», который копит в
 * профиле базу посещённых ресурсов.
 * ========================================================================== */
/* Firefox по умолчанию не выясняет адреса ссылок на HTTPS-страницах —
 * а почти все страницы теперь HTTPS. Запросы идут через DoH. */
pref("network.dns.disablePrefetchFromHTTPS", false);
pref("network.prefetch-next", false);
pref("network.predictor.enabled", false);
pref("network.predictor.enable-prefetch", false);
pref("browser.send_pings", false);
pref("beacon.enabled", false);

/* Referer: сторонним сайтам отдаём только источник, без пути и параметров.
 * Запрет Referer между сайтами целиком (XOriginPolicy=2) не используется:
 * он ломает вход на сайты, оплату и проверки «я не робот», которые
 * сверяют, откуда пришёл запрос. */
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
/* Поисковые подсказки: каждое нажатие клавиши в адресной строке уходит
 * поисковой системе — вместе с набранными адресами, пока браузер не понял,
 * что это адрес. Включаются одним переключателем в настройках поиска. */
pref("browser.search.suggest.enabled", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.urlbar.trending.featureGate", false);
pref("browser.topsites.contile.enabled", false);

/* Система сообщений Firefox (ASRouter): рекомендации расширений и функций,
 * промо «сделайте браузером по умолчанию» с лисой Mozilla в меню,
 * сообщения экспериментов. Три источника из четырёх качаются с серверов
 * Mozilla, четвёртый (onboarding) встроен, но показывает рекламу Firefox
 * внутри нашего браузера. Выключены все; значения — заводские Firefox
 * с enabled:false. */
pref("browser.newtabpage.activity-stream.asrouter.providers.cfr", "{\"id\":\"cfr\",\"enabled\":false,\"type\":\"remote-settings\",\"collection\":\"cfr\",\"updateCycleInMs\":3600000}");
pref("browser.newtabpage.activity-stream.asrouter.providers.message-groups", "{\"id\":\"message-groups\",\"enabled\":false,\"type\":\"remote-settings\",\"collection\":\"message-groups\",\"updateCycleInMs\":3600000}");
pref("browser.newtabpage.activity-stream.asrouter.providers.messaging-experiments", "{\"id\":\"messaging-experiments\",\"enabled\":false,\"type\":\"remote-experiments\",\"updateCycleInMs\":3600000}");
pref("browser.newtabpage.activity-stream.asrouter.providers.onboarding", "{\"id\":\"onboarding\",\"type\":\"local\",\"localProvider\":\"OnboardingMessageProvider\",\"enabled\":false,\"exclude\":[]}");
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons", false);
pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features", false);
pref("browser.newtabpage.activity-stream.asrouter.useRemoteL10n", false);

/* Реклама продуктов Mozilla внутри браузера: раздел «Больше от Mozilla»
 * в настройках, карточки Monitor, VPN, Relay, менеджера паролей и
 * мобильного приложения на странице защиты (about:protections). */
pref("browser.preferences.moreFromMozilla", false);
pref("browser.contentblocking.report.lockwise.enabled", false);
pref("browser.contentblocking.report.show_mobile_app", false);
pref("browser.vpn_promo.enabled", false);
pref("browser.promo.pin.enabled", false);
pref("browser.promo.relay.enabled", false);

/* Аккаунт Mozilla и синхронизация. Данные шифруются на устройстве, но
 * вход, время и частота синхронизации видны серверам Mozilla, а кнопка
 * «Войти в Firefox» — чужой продукт внутри нашего. Выключено целиком:
 * пункт меню, кнопка, страница синхронизации в настройках. Кому нужна
 * синхронизация, включает в about:config. */
pref("identity.fxaccounts.enabled", false);

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
/* Агент браузера по умолчанию в сборку не входит (configs/windows/mozconfig).
 * Настройка — на случай сборки, где его включили: задача в планировщике
 * Windows тогда не регистрируется. */
pref("default-browser-agent.enabled", false);

/* == 9b. Вид интерфейса ====================================================
 * Панель закладок по умолчанию скрыта: на пустом профиле она показывает
 * только подсказку «разместите закладки здесь» и полосу во всю ширину.
 * Кнопка загрузок видна всегда — место под неё не прыгает после первой
 * загрузки.
 *
 * Новая вкладка и домашняя страница — наша страница без сетевых запросов
 * (ui/pages/newtab). Кэш домашней страницы Firefox выключен: он хранит
 * снимок страницы Firefox и показал бы его вместо нашей при запуске.
 * ========================================================================== */
/* Язык интерфейса — как в системе. Пустая строка здесь не «ничего»:
 * для движка это прямой запрос брать языки ОС (LocaleService.cpp,
 * ReadRequestedLocales). Без настройки сборка всегда английская.
 * В сборку входят английский и русский (tools/fetch-l10n.py). */
pref("intl.locale.requested", "");

pref("browser.toolbars.bookmarks.visibility", "never");

/* Группы вкладок включены (кнопка — ui/scripts/vantara-groups.js).
 * «Умные» группы — подсказки названий и похожих вкладок — выключены:
 * им нужна модель ИИ, которую Firefox скачивает с серверов Mozilla. */
pref("browser.tabs.groups.enabled", true);
pref("browser.tabs.groups.smart.enabled", false);
pref("browser.download.autohideButton", false);
pref("vantara.newtab.enabled", true);
pref("browser.startup.homepage.abouthome_cache.enabled", false);

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

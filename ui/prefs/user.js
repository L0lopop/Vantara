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
user_pref("browser.contentblocking.category", "strict");

/* Счётчик заблокированных трекеров в адресной строке. В Firefox он есть,
 * но выключен и включается удалённым экспериментом: флаг живёт в системе
 * Nimbus, у контрольной группы он false. Удалённые эксперименты у нас
 * отключены, поэтому сам он не включится никогда — включаем для всех.
 * Функции защиты не должны раздаваться выборочно по жребию. */
user_pref("browser.urlbar.trackerCount.featureGate", true);
user_pref("browser.urlbar.trackerCount.enabled", true);

/* == 3. Изоляция состояния =================================================
 * Total Cookie Protection (cookieBehavior 5) включает категория из
 * секции 2: каждый сторонний ресурс получает отдельную "банку" кук на
 * каждый сайт верхнего уровня. Здесь — то, что к категории не относится.
 *
 * [РИСК] privacy.firstparty.isolate НЕ включаем: он конфликтует с TCP
 * и даёт менее удобный результат при той же по сути защите.
 * ========================================================================== */
user_pref("privacy.partition.network_state", true);
user_pref("privacy.partition.serviceWorkers", true);
user_pref("privacy.partition.always_partition_third_party_non_cookie_storage", true);
user_pref("privacy.firstparty.isolate", false);

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
user_pref("privacy.resistFingerprinting", false);
user_pref("privacy.resistFingerprinting.letterboxing", false);
user_pref("privacy.resistFingerprinting.block_mozAddonManager", true);
user_pref("webgl.disabled", false);            /* [ЛОМАЕТ] если включить */
user_pref("media.navigator.enabled", true);    /* камера/микрофон по запросу */

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
user_pref("network.dns.disablePrefetchFromHTTPS", false);
user_pref("network.prefetch-next", false);
user_pref("network.predictor.enabled", false);
user_pref("network.predictor.enable-prefetch", false);
user_pref("browser.send_pings", false);
user_pref("beacon.enabled", false);

/* Referer: сторонним сайтам отдаём только источник, без пути и параметров.
 * Запрет Referer между сайтами целиком (XOriginPolicy=2) не используется:
 * он ломает вход на сайты, оплату и проверки «я не робот», которые
 * сверяют, откуда пришёл запрос. */
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
/* Поисковые подсказки: каждое нажатие клавиши в адресной строке уходит
 * поисковой системе — вместе с набранными адресами, пока браузер не понял,
 * что это адрес. Включаются одним переключателем в настройках поиска. */
user_pref("browser.search.suggest.enabled", false);
user_pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
user_pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
user_pref("browser.urlbar.trending.featureGate", false);
user_pref("browser.topsites.contile.enabled", false);

/* Система сообщений Firefox (ASRouter): рекомендации расширений и функций,
 * промо «сделайте браузером по умолчанию» с лисой Mozilla в меню,
 * сообщения экспериментов. Три источника из четырёх качаются с серверов
 * Mozilla, четвёртый (onboarding) встроен, но показывает рекламу Firefox
 * внутри нашего браузера. Выключены все; значения — заводские Firefox
 * с enabled:false. */
user_pref("browser.newtabpage.activity-stream.asrouter.providers.cfr", "{\"id\":\"cfr\",\"enabled\":false,\"type\":\"remote-settings\",\"collection\":\"cfr\",\"updateCycleInMs\":3600000}");
user_pref("browser.newtabpage.activity-stream.asrouter.providers.message-groups", "{\"id\":\"message-groups\",\"enabled\":false,\"type\":\"remote-settings\",\"collection\":\"message-groups\",\"updateCycleInMs\":3600000}");
user_pref("browser.newtabpage.activity-stream.asrouter.providers.messaging-experiments", "{\"id\":\"messaging-experiments\",\"enabled\":false,\"type\":\"remote-experiments\",\"updateCycleInMs\":3600000}");
user_pref("browser.newtabpage.activity-stream.asrouter.providers.onboarding", "{\"id\":\"onboarding\",\"type\":\"local\",\"localProvider\":\"OnboardingMessageProvider\",\"enabled\":false,\"exclude\":[]}");
user_pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons", false);
user_pref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features", false);
user_pref("browser.newtabpage.activity-stream.asrouter.useRemoteL10n", false);

/* Реклама продуктов Mozilla внутри браузера: раздел «Больше от Mozilla»
 * в настройках, карточки Monitor, VPN, Relay, менеджера паролей и
 * мобильного приложения на странице защиты (about:protections). */
user_pref("browser.preferences.moreFromMozilla", false);
user_pref("browser.contentblocking.report.lockwise.enabled", false);
user_pref("browser.contentblocking.report.show_mobile_app", false);
user_pref("browser.vpn_promo.enabled", false);
user_pref("browser.promo.pin.enabled", false);
user_pref("browser.promo.relay.enabled", false);

/* Аккаунт Mozilla и синхронизация. Данные шифруются на устройстве, но
 * вход, время и частота синхронизации видны серверам Mozilla, а кнопка
 * «Войти в Firefox» — чужой продукт внутри нашего. Выключено целиком:
 * пункт меню, кнопка, страница синхронизации в настройках. Кому нужна
 * синхронизация, включает в about:config. */
user_pref("identity.fxaccounts.enabled", false);

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
user_pref("app.update.auto", false);
user_pref("app.update.background.enabled", false);
user_pref("app.update.checkInstallTime", false);
user_pref("app.update.service.enabled", false);
/* Агент браузера по умолчанию в сборку не входит (configs/windows/mozconfig).
 * Настройка — на случай сборки, где его включили: задача в планировщике
 * Windows тогда не регистрируется. */
user_pref("default-browser-agent.enabled", false);

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
user_pref("intl.locale.requested", "");

user_pref("browser.toolbars.bookmarks.visibility", "never");

/* Группы вкладок включены (кнопка — ui/scripts/vantara-groups.js).
 * «Умные» группы — подсказки названий и похожих вкладок — выключены:
 * им нужна модель ИИ, которую Firefox скачивает с серверов Mozilla. */
user_pref("browser.tabs.groups.enabled", true);
user_pref("browser.tabs.groups.smart.enabled", false);

/* Чат-бот в контекстном меню и в боковой панели. Пункт «Спросить
 * ИИ-чат-бота» отправляет выделенный текст стороннему сервису — ChatGPT,
 * Claude, Gemini или другому из списка Mozilla. Это ровно то, чего
 * браузер с упором на защиту данных делать не должен, тем более молча
 * из меню правого щелчка. */
user_pref("browser.ml.chat.enabled", false);
user_pref("browser.ml.chat.menu", false);
user_pref("browser.ml.chat.page", false);
user_pref("browser.ml.chat.sidebar", false);
user_pref("browser.download.autohideButton", false);
user_pref("vantara.newtab.enabled", true);
user_pref("browser.startup.homepage.abouthome_cache.enabled", false);

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

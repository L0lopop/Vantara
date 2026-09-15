<#
.SYNOPSIS
    Поднимает dev-окружение Vantara: профиль Gecko с нашим интерфейсом.

.DESCRIPTION
    Пока форк не собран, интерфейс отлаживается поверх готового Firefox.
    Скрипт создаёт отдельный профиль в .dev-profile, подключает к нему
    ui/chrome через junction (правки CSS видны без пересоздания профиля)
    и копирует ui/prefs/user.js.

    Junction, а не копия: CSS правится в репозитории, браузер читает
    те же файлы. Ctrl+Alt+R в браузере перечитывает стили без перезапуска.

.PARAMETER Fetch
    Скачать portable-сборку Firefox Developer Edition в .dev-runtime,
    если системного Firefox нет. Требует интернет, ~80 МБ.

.PARAMETER Reset
    Удалить профиль и создать заново. Нужно, когда накопился мусор
    или проверяется поведение на чистой установке.

.PARAMETER NoLaunch
    Только подготовить профиль, не запускать браузер.

.PARAMETER Inspect
    Запустить с Marionette — протоколом автоматизации Mozilla. Открывает
    доступ к интерфейсу браузера из кода, чем пользуются tools/inspect-ui.py
    и tools/audit-selectors.py. Без него они подключиться не смогут.

.EXAMPLE
    .\tools\dev-profile.ps1
    .\tools\dev-profile.ps1 -Reset
    .\tools\dev-profile.ps1 -Fetch
#>
[CmdletBinding()]
param(
    [switch]$Fetch,
    [switch]$Reset,
    [switch]$NoLaunch,
    [switch]$Inspect
)

$ErrorActionPreference = 'Stop'

$Root        = Split-Path -Parent $PSScriptRoot
$ProfileDir  = Join-Path $Root '.dev-profile'
$RuntimeDir  = Join-Path $Root '.dev-runtime'
$ChromeSrc   = Join-Path $Root 'ui\chrome'
$PrefsSrc    = Join-Path $Root 'ui\prefs\user.js'

function Write-Step($Message) { Write-Host "  $Message" -ForegroundColor Cyan }
function Write-Ok($Message)   { Write-Host "  $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "  $Message" -ForegroundColor Yellow }

Write-Host ''
Write-Host '  VANTARA - dev-окружение' -ForegroundColor White
Write-Host '  ------------------------' -ForegroundColor DarkGray

# --- 1. Находим движок ------------------------------------------------------
function Find-Gecko {
    $candidates = @(
        (Join-Path $RuntimeDir 'core\firefox.exe'),
        (Join-Path $RuntimeDir 'firefox\firefox.exe'),
        "$env:ProgramFiles\Firefox Developer Edition\firefox.exe",
        "$env:ProgramFiles\Firefox Nightly\firefox.exe",
        "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

$gecko = Find-Gecko

if (-not $gecko -and $Fetch) {
    Write-Step 'Скачиваю Firefox Developer Edition...'
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    $url = 'https://download.mozilla.org/?product=firefox-devedition-latest-ssl&os=win64&lang=en-US'
    $installer = Join-Path $RuntimeDir 'devedition.exe'
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

    Write-Step 'Распаковываю...'
    # Установщик Firefox — это архив 7-Zip SFX, поэтому его содержимое
    # достаётся без запуска установки: система остаётся нетронутой,
    # движок лежит внутри проекта.
    $7z = @(
        "$env:ProgramFiles\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe",
        "$env:USERPROFILE\scoop\shims\7z.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($7z) {
        & $7z x $installer "-o$RuntimeDir" -y | Out-Null
    } else {
        # Без 7-Zip остаётся тихая установка в каталог проекта.
        # Она пишет записи в реестр, поэтому это запасной путь, а не основной.
        Write-Warn '7-Zip не найден, ставлю установщиком в каталог проекта'
        Start-Process -FilePath $installer `
            -ArgumentList '/S', "/D=$(Join-Path $RuntimeDir 'core')" -Wait
    }

    Remove-Item $installer -Force
    $gecko = Find-Gecko
}

if (-not $gecko) {
    Write-Warn 'Движок не найден.'
    Write-Host ''
    Write-Host '  Нужен Firefox, чтобы отлаживать интерфейс до сборки форка.' -ForegroundColor Gray
    Write-Host '  Варианты:' -ForegroundColor Gray
    Write-Host '    1) Запустить этот скрипт с -Fetch (скачает portable-сборку' -ForegroundColor Gray
    Write-Host '       в .dev-runtime, систему не трогает)' -ForegroundColor Gray
    Write-Host '    2) Поставить Firefox Developer Edition вручную:' -ForegroundColor Gray
    Write-Host '       https://www.mozilla.org/firefox/developer/' -ForegroundColor Gray
    Write-Host ''
    exit 1
}

Write-Ok "Движок: $gecko"

# --- 2. Профиль -------------------------------------------------------------
if ($Reset -and (Test-Path $ProfileDir)) {
    Write-Step 'Удаляю старый профиль...'
    Remove-Item $ProfileDir -Recurse -Force
}

$freshProfile = -not (Test-Path $ProfileDir)

if ($freshProfile) {
    New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
    Write-Ok 'Профиль создан'
} else {
    Write-Ok 'Профиль на месте'
}

# --- 3. Интерфейс: junction на ui/chrome ------------------------------------
$chromeLink = Join-Path $ProfileDir 'chrome'

if (Test-Path $chromeLink) {
    $item = Get-Item $chromeLink -Force
    if ($item.LinkType -ne 'Junction') {
        Remove-Item $chromeLink -Recurse -Force
    }
}

if (-not (Test-Path $chromeLink)) {
    # Junction не требует прав администратора, в отличие от символьной ссылки.
    New-Item -ItemType Junction -Path $chromeLink -Target $ChromeSrc | Out-Null
    Write-Ok 'ui\chrome подключён к профилю (junction)'
} else {
    Write-Ok 'ui\chrome уже подключён'
}

# --- 4. Настройки -----------------------------------------------------------
Copy-Item $PrefsSrc (Join-Path $ProfileDir 'user.js') -Force
$prefCount = (Select-String -Path $PrefsSrc -Pattern '^user_pref' -AllMatches).Count
Write-Ok "user.js скопирован ($prefCount настроек)"

# Горячая перезагрузка стилей по Ctrl+Alt+R и доступ к отладчику chrome.
$devPrefs = @'

/* --- добавлено dev-profile.ps1: инструменты разработки ------------------- */
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.remote-enabled", true);
user_pref("devtools.errorconsole.enabled", true);
user_pref("browser.aboutConfig.showWarning", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage", "about:blank");
user_pref("datareporting.policy.firstRunURL", "");
'@
Add-Content -Path (Join-Path $ProfileDir 'user.js') -Value $devPrefs -Encoding utf8
Write-Ok 'Включены инструменты разработки chrome'

# --- 4a. Прогрев нового профиля ---------------------------------------------
# toolkit.legacyUserProfileCustomizations.stylesheets начинает действовать
# только со следующего запуска: на свежем профиле Firefox успевает построить
# интерфейс раньше, чем настройка попадает в prefs.js. Без прогрева первый
# запуск показывает стандартный Firefox, и это каждый раз сбивает с толку.
if ($freshProfile) {
    Write-Step 'Прогреваю профиль (настройки вступают в силу со второго старта)...'
    $warm = Start-Process -FilePath $gecko -PassThru -ArgumentList @(
        '--headless', '--profile', "`"$ProfileDir`"", '--no-remote', '--new-instance'
    )
    Start-Sleep -Seconds 6
    if (-not $warm.HasExited) { $warm | Stop-Process -Force }
    Start-Sleep -Seconds 2
    Write-Ok 'Профиль прогрет'
}

# --- 5. Запуск --------------------------------------------------------------
if ($NoLaunch) {
    Write-Host ''
    Write-Ok "Готово. Профиль: $ProfileDir"
    exit 0
}

Write-Host ''
Write-Step 'Запускаю...'
Write-Host ''
Write-Host '  Горячие клавиши в окне браузера:' -ForegroundColor DarkGray
Write-Host '    Ctrl+Alt+R      перечитать userChrome.css' -ForegroundColor DarkGray
Write-Host '    Ctrl+Alt+Shift+I отладчик интерфейса (Browser Toolbox)' -ForegroundColor DarkGray
Write-Host ''

$launchArgs = @(
    '--profile', "`"$ProfileDir`"",
    '--no-remote',
    '--new-instance'
)

if ($Inspect) {
    # Marionette открывает доступ к интерфейсу браузера из кода.
    # Второй ключ обязателен: без него chrome-контекст закрыт.
    $launchArgs = @('--marionette', '-remote-allow-system-access') + $launchArgs
    Write-Host '  Marionette: 127.0.0.1:2828' -ForegroundColor DarkGray
    Write-Host '    python tools/inspect-ui.py       проверка применённых стилей' -ForegroundColor DarkGray
    Write-Host '    python tools/audit-selectors.py  поиск мёртвых селекторов' -ForegroundColor DarkGray
    Write-Host ''
}

Start-Process -FilePath $gecko -ArgumentList $launchArgs

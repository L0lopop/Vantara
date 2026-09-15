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

.EXAMPLE
    .\tools\dev-profile.ps1
    .\tools\dev-profile.ps1 -Reset
    .\tools\dev-profile.ps1 -Fetch
#>
[CmdletBinding()]
param(
    [switch]$Fetch,
    [switch]$Reset,
    [switch]$NoLaunch
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
    # Установщик Firefox умеет распаковываться без установки в систему.
    Start-Process -FilePath $installer -ArgumentList '/extract', $RuntimeDir -Wait
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

if (-not (Test-Path $ProfileDir)) {
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

Start-Process -FilePath $gecko -ArgumentList @(
    '--profile', "`"$ProfileDir`"",
    '--no-remote',
    '--new-instance'
)

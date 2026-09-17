<#
.SYNOPSIS
    Запускает Vantara для обычной работы.

.DESCRIPTION
    Запускает упакованную сборку (obj-*/dist/vantara — то, что попадает
    в установщик) с постоянным профилем в .user-profile в корне
    репозитория. История, закладки, пароли и настройки сохраняются между
    запусками. Профиль в репозиторий не попадает (.gitignore).

    Браузер работает из копии сборки в .app, а не из dist: иначе открытое
    окно держит файлы, и следующая упаковка сборки падает. Копия
    обновляется при каждом запуске, если браузер закрыт.

    Это не run-build.ps1. Тот каждый раз создаёт пустой профиль и
    включает удалённое управление (Marionette) для автоматических
    проверок. В этом режиме браузер сообщает сайтам, что им управляет
    программа (navigator.webdriver), и поисковики отвечают проверкой
    «я не робот» на каждый запрос. Для работы — только этот скрипт.

    Если Vantara уже открыт, откроется новое окно.

.PARAMETER Dev
    Сборка для разработки (dist/bin) без копирования. Язык интерфейса там
    всегда английский.

.EXAMPLE
    .\tools\start.ps1
#>
[CmdletBinding()]
param(
    [switch]$Dev
)

$ErrorActionPreference = 'Stop'

$Root       = Split-Path -Parent $PSScriptRoot
$ObjDir     = Join-Path $Root 'engine\obj-x86_64-pc-windows-msvc'
$ProfileDir = Join-Path $Root '.user-profile'
$AppDir     = Join-Path $Root '.app'
$Packaged   = Join-Path $ObjDir 'dist\vantara'

New-Item -ItemType Directory -Force $ProfileDir | Out-Null

if ($Dev) {
    $Exe = Join-Path $ObjDir 'dist\bin\vantara.exe'
    # Сборке для разработки нужен доступ песочницы к файлам (см. run-build.ps1).
    $env:MOZ_DEVELOPER_REPO_DIR = Join-Path $Root 'engine'
    $env:MOZ_DEVELOPER_OBJ_DIR  = $ObjDir
} else {
    $Exe = Join-Path $AppDir 'vantara.exe'
    $running = Get-CimInstance Win32_Process -Filter "Name='vantara.exe'" |
               Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($AppDir) }

    if (-not $running -and (Test-Path (Join-Path $Packaged 'vantara.exe'))) {
        # /MIR — точная копия: удалённые из сборки файлы уходят и из .app.
        robocopy $Packaged $AppDir /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) {
            Write-Host "  Не удалось обновить $AppDir (robocopy $LASTEXITCODE)" -ForegroundColor Red
            exit 1
        }
    }
}

if (-not (Test-Path $Exe)) {
    Write-Host "  Нет сборки: $Exe" -ForegroundColor Red
    if (-not $Dev) {
        Write-Host '  Собрать: .\tools\mach.ps1 package-multi-locale --locales en-US ru' -ForegroundColor DarkGray
    }
    exit 2
}

Start-Process -FilePath $Exe -ArgumentList @('--profile', $ProfileDir)
Write-Host "  Vantara запущен, профиль: $ProfileDir" -ForegroundColor Green
# robocopy оставляет код 1 («файлы скопированы») — это не ошибка.
exit 0

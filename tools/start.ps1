<#
.SYNOPSIS
    Запускает Vantara для обычной работы.

.DESCRIPTION
    Запускает упакованную сборку (obj-*/dist/vantara — то, что попадает
    в установщик) с постоянным профилем в .user-profile в корне
    репозитория. История, закладки, пароли и настройки сохраняются между
    запусками. Профиль в репозиторий не попадает (.gitignore).

    Это не run-build.ps1. Тот каждый раз создаёт пустой профиль и
    включает удалённое управление (Marionette) для автоматических
    проверок. В этом режиме браузер сообщает сайтам, что им управляет
    программа (navigator.webdriver), и поисковики отвечают проверкой
    «я не робот» на каждый запрос. Для работы — только этот скрипт.

    Если Vantara с этим профилем уже открыт, откроется новое окно.

.PARAMETER Dev
    Сборка для разработки (dist/bin) вместо упакованной. Язык интерфейса
    там всегда английский.

.EXAMPLE
    .\tools\start.ps1
#>
[CmdletBinding()]
param(
    [switch]$Dev
)

$ErrorActionPreference = 'Stop'

$Root    = Split-Path -Parent $PSScriptRoot
$ObjDir  = Join-Path $Root 'engine\obj-x86_64-pc-windows-msvc'
$ProfileDir = Join-Path $Root '.user-profile'
$Exe     = if ($Dev) { Join-Path $ObjDir 'dist\bin\vantara.exe' }
           else { Join-Path $ObjDir 'dist\vantara\vantara.exe' }

if (-not (Test-Path $Exe)) {
    Write-Host "  Нет сборки: $Exe" -ForegroundColor Red
    if (-not $Dev) {
        Write-Host '  Собрать: .\tools\mach.ps1 package-multi-locale --locales en-US ru' -ForegroundColor DarkGray
    }
    exit 2
}

New-Item -ItemType Directory -Force $ProfileDir | Out-Null

if ($Dev) {
    # Сборке для разработки нужен доступ песочницы к файлам (см. run-build.ps1).
    $env:MOZ_DEVELOPER_REPO_DIR = Join-Path $Root 'engine'
    $env:MOZ_DEVELOPER_OBJ_DIR  = $ObjDir
}

Start-Process -FilePath $Exe -ArgumentList @('--profile', $ProfileDir)
Write-Host "  Vantara запущен, профиль: $ProfileDir" -ForegroundColor Green

<#
.SYNOPSIS
    Запускает собранный Vantara на чистом профиле для проверок.

.DESCRIPTION
    Собранный браузер нельзя просто запустить из obj-*/dist/bin: в сборке
    для разработки файлы интерфейса лежат россыпью, а не в omni.ja, и
    песочница процессов вкладок не даёт их читать. Страницы вроде новой
    вкладки тогда молча остаются пустыми (ошибка NS_ERROR_FAILURE видна
    только в журнале загрузки). `mach run` открывает песочнице доступ
    через MOZ_DEVELOPER_REPO_DIR и MOZ_DEVELOPER_OBJ_DIR — скрипт делает
    то же самое. В установленном браузере этой проблемы нет.

    Профиль каждый раз создаётся заново (verify-prefs.py --prepare) и
    запускается с Marionette: к нему подключаются verify-prefs.py,
    inspect-ui.py, audit-hover.py, audit-selectors.py.

.PARAMETER ProfileDir
    Каталог профиля. По умолчанию .native-profile в корне репозитория.

.PARAMETER Light
    Светлая тема системы вместо тёмной.

.PARAMETER Locale
    Язык интерфейса (en-US, ru) вместо языка системы. Действует только в
    упакованной сборке — см. Packaged.

.PARAMETER Packaged
    Запустить упакованную сборку (obj-*/dist/vantara, как в установщике)
    вместо сборки для разработки. Нужна для проверки языков: в dist/bin
    список языков (res/multilocale.txt) движок не читает, и интерфейс там
    всегда английский. Собирается командой
    .\tools\mach.ps1 package-multi-locale --locales en-US ru

.EXAMPLE
    .\tools\run-build.ps1
    .\tools\run-build.ps1 -Light
    .\tools\run-build.ps1 -Packaged
    .\tools\run-build.ps1 -Packaged -Locale en-US
#>
[CmdletBinding()]
param(
    [string]$ProfileDir,
    [switch]$Light,
    [switch]$Packaged,
    [ValidatePattern('^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$')]
    [string]$Locale
)

$ErrorActionPreference = 'Stop'

$Root   = Split-Path -Parent $PSScriptRoot
$Engine = Join-Path $Root 'engine'
$ObjDir = Join-Path $Engine 'obj-x86_64-pc-windows-msvc'
$Exe    = if ($Packaged) { Join-Path $ObjDir 'dist\vantara\vantara.exe' }
          else { Join-Path $ObjDir 'dist\bin\vantara.exe' }
if (-not $ProfileDir) { $ProfileDir = Join-Path $Root '.native-profile' }

if (-not (Test-Path $Exe)) {
    Write-Host "  Нет сборки: $Exe" -ForegroundColor Red
    exit 2
}

# Закрываются только тестовые окна — запущенные из папки сборки. Браузер
# для работы (tools/start.ps1) живёт в .app и не трогается.
Get-CimInstance Win32_Process -Filter "Name='vantara.exe'" |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($ObjDir) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }
# Процесс отпускает lock-файлы профиля не сразу.
Start-Sleep -Milliseconds 800

if (Test-Path $ProfileDir) {
    Remove-Item -Recurse -Force $ProfileDir -Confirm:$false
}
New-Item -ItemType Directory -Force $ProfileDir | Out-Null

python (Join-Path $Root 'tools\verify-prefs.py') --prepare $ProfileDir | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '  Профиль не подготовлен' -ForegroundColor Red
    exit 1
}

$dark = if ($Light) { 0 } else { 1 }
Add-Content -Encoding utf8 (Join-Path $ProfileDir 'user.js') "user_pref(`"ui.systemUsesDarkTheme`", $dark);"
if ($Locale) {
    Add-Content -Encoding utf8 (Join-Path $ProfileDir 'user.js') "user_pref(`"intl.locale.requested`", `"$Locale`");"
}

# Упакованной сборке доступ не нужен: её файлы в omni.ja.
if (-not $Packaged) {
    $env:MOZ_DEVELOPER_REPO_DIR = $Engine
    $env:MOZ_DEVELOPER_OBJ_DIR  = $ObjDir
}

Start-Process -FilePath $Exe -ArgumentList @(
    '--marionette', '-remote-allow-system-access', '-no-remote',
    '--profile', $ProfileDir
)

# Ждём Marionette: проверки сразу после запуска иначе падают с отказом
# в соединении.
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', 2828)
        $client.Close()
        Write-Host '  Браузер запущен, Marionette на 127.0.0.1:2828' -ForegroundColor Green
        exit 0
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

Write-Host '  Браузер не ответил за 30 секунд' -ForegroundColor Red
exit 1

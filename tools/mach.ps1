<#
.SYNOPSIS
    Запускает mach — сборочный инструмент Mozilla — в окружении MozillaBuild.

.DESCRIPTION
    На Windows mach нельзя вызвать напрямую: это Python-скрипт без
    расширения, которому нужны утилиты msys2 из MozillaBuild. Именно на
    этом спотыкается `surfer build` — он зовёт ./mach так, будто работает
    в Linux.

    Скрипт поднимает окружение MozillaBuild и передаёт туда аргументы.

    Каталог состояния сборки направлен в .mozbuild внутри проекта, а не
    в домашний каталог пользователя: иначе mach спрашивает про него при
    первом запуске и складывает кэши в стороне от репозитория.

.PARAMETER Arguments
    Всё, что передаётся mach: build, run, package, clobber и прочее.

.EXAMPLE
    .\tools\mach.ps1 build
    .\tools\mach.ps1 build faster
    .\tools\mach.ps1 package
    .\tools\mach.ps1 clobber
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'

$Root       = Split-Path -Parent $PSScriptRoot
$EngineDir  = Join-Path $Root 'engine'
$StateDir   = Join-Path $Root '.mozbuild'
$MozBuild   = 'C:\mozilla-build'
$Bash       = Join-Path $MozBuild 'msys2\usr\bin\bash.exe'

if (-not (Test-Path $Bash)) {
    Write-Host "  MozillaBuild не найден: $MozBuild" -ForegroundColor Red
    Write-Host '  Скачать: https://ftp.mozilla.org/pub/mozilla/libraries/win32/MozillaBuildSetup-Latest.exe' -ForegroundColor Gray
    exit 1
}

if (-not (Test-Path $EngineDir)) {
    Write-Host '  Нет каталога engine. Сначала: npx surfer download' -ForegroundColor Red
    exit 1
}

if (-not $Arguments) {
    Write-Host '  Укажите команду mach, например: .\tools\mach.ps1 build' -ForegroundColor Yellow
    exit 1
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

# Пути внутри msys2: D:\Vantara -> /d/Vantara
function ConvertTo-MsysPath([string]$WindowsPath) {
    $drive = $WindowsPath.Substring(0, 1).ToLower()
    $rest = $WindowsPath.Substring(2).Replace('\', '/')
    return "/$drive$rest"
}

$engineMsys = ConvertTo-MsysPath $EngineDir
$stateMsys  = ConvertTo-MsysPath $StateDir
$machArgs   = ($Arguments | ForEach-Object { "'$_'" }) -join ' '

# Прямой вызов bash минует msys2_shell.cmd, который обычно собирает PATH
# для MozillaBuild. Поэтому нужные каталоги добавляем сами: без python3
# mach падает с «/usr/bin/env: python3: No such file or directory».
# USERPROFILE передаём явно: bash -l поднимает чистое окружение, а mach
# вычисляет домашний каталог всегда — даже когда MOZBUILD_STATE_PATH задан,
# потому что значение по умолчанию считается до проверки переменной.
# Без этого сборка падает на "Could not determine home directory".
$userProfile = $env:USERPROFILE

# DISABLE_TELEMETRY=1 обязателен, и не только из принципа. Без него mach
# при первом запуске обращается к Bugzilla и спрашивает согласие на сбор
# данных о сборке. В неинтерактивном запуске ответить некому, и процесс
# просто висит: ни вывода, ни нагрузки на процессор, ни ошибки.
$command = @(
    "export PATH=/c/mozilla-build/python3:/c/mozilla-build/bin:`$PATH",
    "export USERPROFILE='$userProfile'",
    "export MOZBUILD_STATE_PATH='$stateMsys'",
    "export DISABLE_TELEMETRY=1",
    "cd '$engineMsys'",
    "./mach $machArgs"
) -join ' && '

Write-Host "  mach $($Arguments -join ' ')" -ForegroundColor Cyan
Write-Host "  состояние сборки: $StateDir" -ForegroundColor DarkGray
Write-Host ''

$env:MOZILLABUILD = $MozBuild

# Запуск через Start-Process, а не через `& $Bash`: PowerShell 5.1
# превращает любую строку из stderr нативной программы в ошибку и обрывает
# выполнение. Профиль msys2 пишет туда безобидное сообщение stty, и этого
# достаточно, чтобы сборка «падала» на первой секунде.
#
# Вывод идёт в файлы и одновременно печатается: сборка длится часами,
# и смотреть на неё надо по ходу дела, а не после.
$outLog = Join-Path $StateDir 'mach-out.log'
$errLog = Join-Path $StateDir 'mach-err.log'

$process = Start-Process -FilePath $Bash `
    -ArgumentList '-l', '-c', $command `
    -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog

if (Test-Path $outLog) { Get-Content $outLog }

# stty из профиля msys2 — не ошибка, показывать его незачем.
if (Test-Path $errLog) {
    Get-Content $errLog | Where-Object { $_ -notmatch 'stty:|Inappropriate ioctl' } |
        ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
}

Write-Host ''
if ($process.ExitCode -eq 0) {
    Write-Host '  Готово' -ForegroundColor Green
} else {
    Write-Host "  mach завершился с кодом $($process.ExitCode)" -ForegroundColor Red
    Write-Host "  Полный вывод: $outLog" -ForegroundColor DarkGray
}

exit $process.ExitCode

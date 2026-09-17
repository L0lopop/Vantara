<#
.SYNOPSIS
    Снимает скриншот окна браузера для проверки интерфейса.

.DESCRIPTION
    Интерфейс браузера — это не веб-страница, его не покажет ни один
    инструмент для сайтов. Чтобы видеть, что получилось на самом деле,
    нужен снимок настоящего окна.

    Скрипт находит окно по имени процесса, поднимает его на передний план
    и сохраняет PNG.

.PARAMETER Process
    Имя процесса. По умолчанию firefox.

.PARAMETER Out
    Путь для сохранения. По умолчанию docs/screenshots/<процесс>-<время>.png

.PARAMETER Delay
    Пауза перед снимком в секундах: окно должно успеть отрисоваться.

.PARAMETER FullScreen
    Снять весь экран вместо окна.

.EXAMPLE
    .\tools\screenshot.ps1
    .\tools\screenshot.ps1 -Delay 5 -Out shot.png
#>
[CmdletBinding()]
param(
    [string]$Process = 'firefox',
    [string]$Out,
    # Только окна программ из этой папки (например, тестовая сборка в obj-*),
    # чтобы не снять открытый рабочий браузер.
    [string]$PathPrefix,
    [int]$Delay = 2,
    [switch]$FullScreen
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Работа с окнами живёт в user32: по-другому границы окна не узнать.
if (-not ([System.Management.Automation.PSTypeName]'VantaraWin').Type) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;

public struct RECT { public int Left, Top, Right, Bottom; }

public class VantaraWin {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
}

$Root = Split-Path -Parent $PSScriptRoot

if (-not $Out) {
    $dir = Join-Path $Root 'docs\screenshots'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $Out = Join-Path $dir "$Process-$(Get-Date -Format 'yyyyMMdd-HHmmss').png"
}

# --- Находим окно -----------------------------------------------------------
if (-not $FullScreen) {
    $proc = Get-Process -Name $Process -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 } |
            Where-Object { -not $PathPrefix -or ($_.Path -and $_.Path.StartsWith($PathPrefix)) } |
            Select-Object -First 1

    if (-not $proc) {
        Write-Host "  Окно процесса '$Process' не найдено." -ForegroundColor Yellow
        Write-Host "  Запущен ли браузер? Снимаю весь экран." -ForegroundColor Gray
        $FullScreen = $true
    } else {
        $handle = $proc.MainWindowHandle
        [VantaraWin]::ShowWindow($handle, 9) | Out-Null   # 9 = восстановить
        [VantaraWin]::SetForegroundWindow($handle) | Out-Null
        Start-Sleep -Milliseconds 400
    }
}

Start-Sleep -Seconds $Delay

# --- Определяем область -----------------------------------------------------
if ($FullScreen) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $x = $bounds.X; $y = $bounds.Y
    $w = $bounds.Width; $h = $bounds.Height
} else {
    $rect = New-Object RECT
    [VantaraWin]::GetWindowRect($handle, [ref]$rect) | Out-Null
    $x = $rect.Left; $y = $rect.Top
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top

    if ($w -le 0 -or $h -le 0) {
        throw "Окно свёрнуто или имеет нулевой размер ($w x $h)."
    }
}

# --- Снимаем ----------------------------------------------------------------
$bitmap = New-Object System.Drawing.Bitmap $w, $h
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($x, $y, 0, 0, $bitmap.Size)
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "  Снимок: $Out  ($w x $h)" -ForegroundColor Green

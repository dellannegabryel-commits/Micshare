<#
.SYNOPSIS
    Installs VB-Cable virtual audio driver for Micshare
.DESCRIPTION
    Downloads and installs VB-Cable (virtual audio cable) so Micshare can route
    audio to Discord, OBS, games, etc. as a virtual microphone.
    Requires Administrator privileges.
#>

param(
    [switch]$Force,
    [switch]$NoReboot
)

$ErrorActionPreference = "Stop"

function IsAdmin() {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function HasVBCable() {
    # Check if VB-Cable device exists
    try {
        $devices = (Get-PnpDevice -Class "AudioEndpoint" -Status "OK" -ErrorAction SilentlyContinue) |
                   Where-Object { $_.FriendlyName -like "*CABLE*" -or $_.FriendlyName -like "*VB-Audio*" }
        return $devices.Count -gt 0
    } catch {
        return $false
    }
}

function DownloadVBCable() {
    $url = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack43.zip"
    $tempDir = [System.IO.Path]::GetTempPath()
    $zipPath = Join-Path $tempDir "VBCABLE_Driver_Pack43.zip"
    $extractDir = Join-Path $tempDir "VBCABLE_Driver_Pack43"

    Write-Host "Baixando VB-Cable Driver Pack..." -ForegroundColor Cyan

    try {
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Error "Falha ao baixar VB-Cable: $($_.Exception.Message)"
        Write-Host "Tente baixar manualmente de: https://vb-audio.com/Cable/" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Extraindo..." -ForegroundColor Cyan

    if (Test-Path $extractDir) {
        Remove-Item $extractDir -Recurse -Force
    }

    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    return $extractDir
}

function InstallVBCable($extractDir) {
    # Find the installer (usually in Win64 or root)
    $installer = Get-ChildItem -Path $extractDir -Recurse -Filter "VBCABLE_Setup*.exe" | Select-Object -First 1

    if (-not $installer) {
        $installer = Get-ChildItem -Path $extractDir -Recurse -Filter "setup*.exe" | Select-Object -First 1
    }

    if (-not $installer) {
        Write-Error "Instalador VB-Cable nao encontrado em $extractDir"
        exit 1
    }

    Write-Host "Executando instalador: $($installer.FullName)" -ForegroundColor Cyan
    Write-Host "" -ForegroundColor Yellow
    Write-Host "==============================================" -ForegroundColor Yellow
    Write-Host "  JANELA DO INSTALADOR VAI ABRIR" -ForegroundColor Yellow
    Write-Host "  Clique em 'Install Driver' -> 'OK'" -ForegroundColor Yellow
    Write-Host "  Depois feche a janela do instalador" -ForegroundColor Yellow
    Write-Host "==============================================" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow

    # Run installer (requires admin, shows GUI)
    $process = Start-Process -FilePath $installer.FullName -Wait -PassThru

    if ($process.ExitCode -ne 0) {
        Write-Warning "Instalador retornou codigo $($process.ExitCode)."
        Write-Host "Verifique se clicou em 'Install Driver' e 'OK' na janela do instalador." -ForegroundColor Yellow
    }
}

# Main
Write-Host "=== Micshare VB-Cable Installer ===" -ForegroundColor Green

if ((-not (IsAdmin))) {
    Write-Host "Este script requer privilegios de Administrador." -ForegroundColor Red
    Write-Host "Re-executando como Admin..." -ForegroundColor Yellow

    # Re-run as admin
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Definition)`" $($args -join ' ')" -Verb RunAs
    exit 0
}

if ((HasVBCable) -and (-not $Force)) {
    Write-Host "VB-Cable ja esta instalado." -ForegroundColor Green
    Write-Host "Use -Force para reinstalar." -ForegroundColor Cyan
    exit 0
}

Write-Host "VB-Cable nao encontrado. Iniciando instalacao..." -ForegroundColor Yellow

$extractDir = DownloadVBCable
InstallVBCable $extractDir

# Verify installation
Write-Host "`nVerificando instalacao..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

if (HasVBCable) {
    Write-Host "VB-Cable detectado com sucesso!" -ForegroundColor Green
} else {
    Write-Warning "VB-Cable ainda nao detectado. Pode precisar de reinicializacao."
}

Write-Host "`nInstalacao concluida." -ForegroundColor Green

if (-not $NoReboot) {
    Write-Host "E NECESSARIO REINICIAR O COMPUTADOR para o driver funcionar." -ForegroundColor Red
    $reboot = Read-Host "Reiniciar agora? (S/N)"
    if ($reboot -eq 'S' -or $reboot -eq 's') {
        Restart-Computer -Force
    }
} else {
    Write-Host "Lembre-se de reiniciar o computador antes de usar o Micshare." -ForegroundColor Yellow
}

Write-Host "`nApos reiniciar, verifique com: npm --prefix packages/pc run dev -- --list-devices" -ForegroundColor Cyan
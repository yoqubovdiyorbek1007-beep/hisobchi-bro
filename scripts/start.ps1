# Hisobchi-bro: hammasini ishga tushiradi.
# 1) docker compose (api + nginx + cloudflare tunnel)
# 2) tunnel manzilini topadi (*.trycloudflare.com)
# 3) frontend/config.js ga yozadi va GitHub ga push qiladi -> GitHub Pages yangilanadi
# Ishlatish:  powershell -ExecutionPolicy Bypass -File D:\Hisobchi-bro\scripts\start.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

if (-not (Test-Path "$root\.env")) { throw ".env fayli yo'q. .env.example dan nusxa olib to'ldiring." }

# Docker ishlayaptimi?
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop ishga tushirilmoqda..."
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    for ($i = 0; $i -lt 60; $i++) { Start-Sleep 3; docker info *> $null; if ($LASTEXITCODE -eq 0) { break } }
    if ($LASTEXITCODE -ne 0) { throw "Docker ishga tushmadi" }
}

Write-Host "Konteynerlar ko'tarilmoqda..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose xatosi" }

# Tunnel manzilini kutamiz
$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
    Start-Sleep 2
    $logs = (docker compose logs tunnel 2>&1 | Out-String)
    $m = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Count) { $url = $m[$m.Count - 1].Value }
}
if (-not $url) { throw "Tunnel manzili topilmadi. 'docker compose logs tunnel' ni tekshiring." }
Write-Host "Tunnel: $url"

# Backend javob beryaptimi?
try { Invoke-RestMethod "$url/api/health" -TimeoutSec 20 | Out-Null; Write-Host "API ishlayapti" }
catch { Write-Warning "API hali javob bermadi (tunnel DNS bir oz kechikishi mumkin)" }

# Frontend konfiguratsiyasi
$cfg = "// Avtomatik yozildi: scripts/start.ps1 ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))`n// API manzili - Cloudflare tunnel.`nwindow.API_BASE = '$url';`n"
[IO.File]::WriteAllText("$root\frontend\config.js", $cfg, (New-Object Text.UTF8Encoding $false))

# GitHub Pages ga yuborish
if (Test-Path "$root\.git") {
    git add frontend/config.js
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        git commit -m "Tunnel manzili yangilandi: $url" | Out-Null
        git push
        Write-Host "GitHub Pages 1-2 daqiqada yangilanadi."
    }
    $remote = git remote get-url origin 2>$null
    if ($remote -match 'github\.com[:/]([^/]+)/([^/.]+)') {
        Write-Host "Sayt: https://$($Matches[1].ToLower()).github.io/$($Matches[2])/"
    }
}
Write-Host "Mahalliy: http://localhost:8080"

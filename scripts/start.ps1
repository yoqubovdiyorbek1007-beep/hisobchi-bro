# Hisobchi-bro: hammasini ishga tushiradi.
# 1) docker compose (api + nginx + cloudflare tunnel)
# 2) tunnel manzilini topadi (*.trycloudflare.com)
# 3) frontend/config.js ga yozadi va GitHub ga push qiladi -> GitHub Pages yangilanadi
# Ishlatish:
#   powershell -ExecutionPolicy Bypass -File D:\Hisobchi-bro\scripts\start.ps1          (bir marta)
#   powershell -ExecutionPolicy Bypass -File D:\Hisobchi-bro\scripts\start.ps1 -Watch   (doimiy kuzatish:
#       Docker/tunnel qayta yonib manzil o'zgarsa, sayt avtomatik yangilanadi)

param([switch]$Watch)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$logFile = Join-Path $root 'scripts\start.log'

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

if (-not (Test-Path "$root\.env")) { Write-Log ".env fayli yo'q. .env.example dan nusxa olib to'ldiring."; exit 1 }

function Wait-Docker {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return $true }
    Write-Log "Docker Desktop ishga tushirilmoqda..."
    if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
        Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    }
    for ($i = 0; $i -lt 100; $i++) { Start-Sleep 3; docker info *> $null; if ($LASTEXITCODE -eq 0) { return $true } }
    Write-Log "Docker ishga tushmadi"
    return $false
}

function Get-TunnelUrl {
    # Faqat hozirgi konteyner loglari (oldingi ishga tushirishlar emas)
    $id = docker compose ps -q tunnel 2>$null
    if (-not $id) { return $null }
    $started = docker inspect -f '{{.State.StartedAt}}' $id 2>$null
    $logs = (docker logs --since $started $id 2>&1 | Out-String)
    $m = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Count) { return $m[$m.Count - 1].Value }
    return $null
}

function Get-ConfiguredUrl {
    $c = Get-Content "$root\frontend\config.js" -Raw -ErrorAction SilentlyContinue
    return [regex]::Match([string]$c, "https://[a-z0-9-]+\.trycloudflare\.com").Value
}

function Publish-Url($url) {
    $cfg = "// Avtomatik yozildi: scripts/start.ps1 ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))`n// API manzili - Cloudflare tunnel.`nwindow.API_BASE = '$url';`n"
    [IO.File]::WriteAllText("$root\frontend\config.js", $cfg, (New-Object Text.UTF8Encoding $false))
    if (-not (Test-Path "$root\.git")) { return }
    git add frontend/config.js
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        git commit -q -m "Tunnel manzili yangilandi: $url"
        for ($i = 0; $i -lt 5; $i++) {
            git push -q 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Write-Log "GitHub ga yuborildi, Pages 1-2 daqiqada yangilanadi."; return }
            Start-Sleep 15   # internet hali ulanmagan bo'lishi mumkin
        }
        Write-Log "git push xatosi - keyingi tekshiruvda qayta urinamiz"
    }
}

function Sync-Site {
    if (-not (Wait-Docker)) { return }
    docker compose up -d *> $null
    $url = $null
    for ($i = 0; $i -lt 40 -and -not $url; $i++) { $url = Get-TunnelUrl; if (-not $url) { Start-Sleep 2 } }
    if (-not $url) { Write-Log "Tunnel manzili topilmadi"; return }
    $unpushed = (git log origin/main..HEAD --oneline 2>$null | Measure-Object).Count
    if ($url -ne (Get-ConfiguredUrl)) {
        Write-Log "Yangi tunnel manzili: $url"
        Publish-Url $url
    } elseif ($unpushed -gt 0) {
        git push -q 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Log "Kechikkan push yuborildi" }
    }
    return $url
}

Write-Log "Konteynerlar ko'tarilmoqda..."
if (Wait-Docker) { docker compose up -d --build 2>&1 | Out-Null }
$url = Sync-Site
if ($url) {
    try { Invoke-RestMethod "$url/api/health" -TimeoutSec 20 | Out-Null; Write-Log "API ishlayapti: $url" }
    catch { Write-Log "API hali javob bermadi (tunnel DNS bir oz kechikishi mumkin)" }
}
$remote = git remote get-url origin 2>$null
if ($remote -match 'github\.com[:/]([^/]+)/([^/.]+)') { Write-Host "Sayt: https://$($Matches[1].ToLower()).github.io/$($Matches[2])/" }
Write-Host "Mahalliy: http://localhost:8080"

if ($Watch) {
    Write-Log "Kuzatish rejimi: har 30 soniyada tunnel manzili tekshiriladi."
    while ($true) {
        Start-Sleep 30
        try { Sync-Site | Out-Null } catch { Write-Log "Xato: $_" }
    }
}

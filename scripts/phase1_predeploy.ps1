param(
    [string]$ComposeFile = "docker-compose.yml",
    [string[]]$Phase1Images = @("hunter-backend", "hunter-frontend", "hunter-nginx")
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Phase 1 pre-deploy starting..." -ForegroundColor Cyan

Write-Host "==> Building Phase 1 images" -ForegroundColor Cyan
docker compose build backend frontend nginx | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Docker compose build failed."
}

Write-Host "==> Running Trivy pre-deploy scan" -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptRoot "trivy_scan.ps1") `
    -ComposeFile $ComposeFile `
    -ImageList ($Phase1Images -join ",")
if ($LASTEXITCODE -ne 0) {
    throw "Trivy pre-deploy scan failed."
}

Write-Host "==> Starting Phase 1 stack" -ForegroundColor Cyan
docker compose up -d postgres redis minio vault backend frontend nginx prometheus grafana | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Docker compose up failed."
}

Write-Host "==> Waiting for backend readiness" -ForegroundColor Cyan
$backendReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8000/metrics" -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($health.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $backendReady) {
    throw "Backend did not become ready in time."
}

Write-Host "==> Running Phase 1 smoke test" -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptRoot "phase1_smoke.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Phase 1 smoke test failed."
}

Write-Host "Phase 1 pre-deploy completed successfully." -ForegroundColor Green

param(
    [string]$Container = "hunter-ollama",
    [string]$Model = "mistral"
)

$ErrorActionPreference = "Stop"

Write-Host "==> Waiting for Ollama container to be ready..." -ForegroundColor Cyan

$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        docker exec $Container ollama list 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
}

if (-not $ready) {
    Write-Error "Ollama container '$Container' did not become ready in time."
    exit 1
}

Write-Host "==> Pulling model: $Model (first run may take several minutes ~4 GB)" -ForegroundColor Cyan
docker exec $Container ollama pull $Model

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to pull model '$Model'."
    exit 1
}

Write-Host "==> Verifying model is available..." -ForegroundColor Cyan
$list = docker exec $Container ollama list
$found = $list | Where-Object { $_ -match $Model }
if (-not $found) {
    Write-Error "Model '$Model' not found after pull."
    exit 1
}

Write-Host ($list -join "`n")
Write-Host "==> Done. Mistral is ready at http://localhost:11434" -ForegroundColor Green

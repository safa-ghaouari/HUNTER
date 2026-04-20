Set-Location "$PSScriptRoot\.."

Write-Host "Stopping old backend container..." -ForegroundColor Yellow
docker stop hunter-backend 2>$null
docker rm hunter-backend 2>$null
docker stop hunter-celery-worker 2>$null
docker rm hunter-celery-worker 2>$null
docker stop hunter-celery-beat 2>$null
docker rm hunter-celery-beat 2>$null

Write-Host "Starting fresh containers with latest image..." -ForegroundColor Cyan
docker compose up -d backend celery-worker celery-beat

Write-Host "Waiting for backend to be ready..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:8000/auth/login" -Method POST `
            -ContentType "application/json" `
            -Body '{"email":"soc.admin@hunter.local","password":"HunterAdmin2026Secure"}' `
            -ErrorAction Stop
        if ($r.access_token) {
            Write-Host "[OK] Backend is up and responding!" -ForegroundColor Green
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
}
Write-Host "Done." -ForegroundColor Green

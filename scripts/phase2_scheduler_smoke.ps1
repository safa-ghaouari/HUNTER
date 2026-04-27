param(
    [string]$ApiBaseUrl = "http://localhost:8000",
    [string]$AdminEmail = "soc.admin@hunter.local",
    [string]$AdminPassword = "HunterAdmin2026Secure",
    [int]$TimeoutSeconds = 150
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [hashtable]$Headers,
        $Body
    )

    $params = @{
        Method      = $Method
        Uri         = $Uri
        ErrorAction = "Stop"
    }

    if ($Headers) {
        $params.Headers = $Headers
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    Invoke-RestMethod @params
}

Write-Host "Phase 2 scheduler smoke test starting..." -ForegroundColor Cyan

$loginResponse = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}

if (-not $loginResponse.access_token) {
    throw "Admin login failed."
}

$authHeaders = @{
    Authorization = "Bearer $($loginResponse.access_token)"
}

$sourceName = "Phase 2 Scheduler Smoke Feed $(Get-Date -Format 'yyyyMMddHHmmss')"
$source = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/sources" -Headers $authHeaders -Body @{
    name = $sourceName
    type = "rss"
    url = "file:///app/backend/fixtures/rss/phase2_collection_feed.xml"
    polling_interval_minutes = 1
    is_active = $true
}

if (-not $source.id) {
    throw "Failed to create the scheduler smoke source."
}

Write-Host "Scheduler smoke source created: $($source.id)" -ForegroundColor Green

$deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
$scheduledJob = $null

while ((Get-Date).ToUniversalTime() -lt $deadline) {
    Start-Sleep -Seconds 5
    $jobs = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/collections" -Headers $authHeaders
    $scheduledJob = $jobs | Where-Object {
        $_.source_id -eq $source.id -and $_.params.trigger -eq "scheduler"
    } | Select-Object -First 1

    if ($scheduledJob) {
        break
    }
}

if (-not $scheduledJob) {
    throw "The scheduler did not queue a collection job within $TimeoutSeconds seconds."
}

Write-Host "Scheduled collection job queued: $($scheduledJob.id)" -ForegroundColor Green

$finalJob = $null
while ((Get-Date).ToUniversalTime() -lt $deadline) {
    Start-Sleep -Seconds 3
    $finalJob = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/collections/$($scheduledJob.id)" -Headers $authHeaders
    if ($finalJob.status -in @("success", "failed")) {
        break
    }
}

if ($null -eq $finalJob) {
    throw "Scheduler job polling did not return a response."
}

if ($finalJob.status -ne "success") {
    throw "Scheduled collection job failed: $($finalJob.error_message)"
}

if (($finalJob.result_summary.items_processed | ForEach-Object { [int]$_ }) -lt 1) {
    throw "Scheduled collection job completed but no feed entries were processed."
}

if (($finalJob.result_summary.iocs_extracted | ForEach-Object { [int]$_ }) -lt 1) {
    throw "Scheduled collection job completed but no IoCs were extracted."
}

if (-not $finalJob.result_summary.opencti_grouping_id) {
    throw "Scheduled collection job completed but no OpenCTI grouping ID was returned."
}

Write-Host "Scheduled collection job succeeded." -ForegroundColor Green
Write-Host "Items processed: $($finalJob.result_summary.items_processed)" -ForegroundColor Green
Write-Host "IoCs extracted: $($finalJob.result_summary.iocs_extracted)" -ForegroundColor Green
Write-Host "OpenCTI grouping ID: $($finalJob.result_summary.opencti_grouping_id)" -ForegroundColor Green
if ($finalJob.result_summary.misp_event_id) {
    Write-Host "MISP event ID: $($finalJob.result_summary.misp_event_id)" -ForegroundColor Green
}
elseif ($finalJob.result_summary.misp_error) {
    Write-Host "MISP sync warning: $($finalJob.result_summary.misp_error)" -ForegroundColor Yellow
}
Write-Host "Phase 2 scheduler smoke test completed successfully." -ForegroundColor Cyan

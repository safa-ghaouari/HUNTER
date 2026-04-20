param(
    [string]$ApiBaseUrl = "http://localhost:8000",
    [string]$AdminEmail = "soc.admin@hunter.local",
    [string]$AdminPassword = "HunterAdmin2026Secure"
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

Write-Host "Phase 2 collection smoke test starting..." -ForegroundColor Cyan

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

$source = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/sources" -Headers $authHeaders -Body @{
    name = "Phase 2 Collection Smoke Feed"
    type = "rss"
    url = "file:///app/backend/fixtures/rss/phase2_collection_feed.xml"
    polling_interval_minutes = 15
}

if (-not $source.id) {
    throw "Failed to create the Phase 2 smoke source."
}

Write-Host "Collection source created: $($source.id)" -ForegroundColor Green

$job = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/collections" -Headers $authHeaders -Body @{
    source_id = $source.id
}

if (-not $job.id) {
    throw "Failed to create the collection job."
}

if (-not $job.celery_task_id) {
    throw "Collection job was created but no Celery task ID was returned."
}

Write-Host "Collection job queued: $($job.id)" -ForegroundColor Green

$finalJob = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 2
    $finalJob = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/collections/$($job.id)" -Headers $authHeaders
    if ($finalJob.status -in @("success", "failed")) {
        break
    }
}

if ($null -eq $finalJob) {
    throw "Collection job polling did not return a response."
}

if ($finalJob.status -ne "success") {
    throw "Collection job failed: $($finalJob.error_message)"
}

if (($finalJob.result_summary.items_processed | ForEach-Object { [int]$_ }) -lt 1) {
    throw "Collection job completed but no feed entries were processed."
}

if (($finalJob.result_summary.sources_processed | ForEach-Object { [int]$_ }) -lt 1) {
    throw "Collection job completed but no sources were processed."
}

if (($finalJob.result_summary.iocs_extracted | ForEach-Object { [int]$_ }) -lt 1) {
    throw "Collection job completed but no IoCs were extracted."
}

if (-not $finalJob.result_summary.opencti_grouping_id) {
    throw "Collection job completed but no OpenCTI grouping ID was returned."
}

Write-Host "Collection job succeeded." -ForegroundColor Green
Write-Host "Items processed: $($finalJob.result_summary.items_processed)" -ForegroundColor Green
Write-Host "Sources processed: $($finalJob.result_summary.sources_processed)" -ForegroundColor Green
Write-Host "IoCs extracted: $($finalJob.result_summary.iocs_extracted)" -ForegroundColor Green
Write-Host "OpenCTI grouping ID: $($finalJob.result_summary.opencti_grouping_id)" -ForegroundColor Green
if ($finalJob.result_summary.misp_event_id) {
    Write-Host "MISP event ID: $($finalJob.result_summary.misp_event_id)" -ForegroundColor Green
}
elseif ($finalJob.result_summary.misp_error) {
    Write-Host "MISP sync warning: $($finalJob.result_summary.misp_error)" -ForegroundColor Yellow
}
Write-Host "Phase 2 collection smoke test completed successfully." -ForegroundColor Cyan

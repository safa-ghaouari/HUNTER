param(
    [string]$ApiBaseUrl = "http://localhost:8000",
    [string]$AdminEmail = "soc.admin@hunter.local",
    [string]$AdminPassword = "HunterAdmin2026Secure",
    [string]$ClientUserPassword = "ClientTest2026!",
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST", "PATCH")]
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

    return Invoke-RestMethod @params
}

Write-Host "Phase 4 correlation smoke test starting..." -ForegroundColor Cyan

# ------------------------------------------------------------------
# 1. Admin login
# ------------------------------------------------------------------
$loginResponse = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}
if (-not $loginResponse.access_token) { throw "Admin login failed." }
$authHeaders = @{ Authorization = "Bearer $($loginResponse.access_token)" }
Write-Host "[OK] Admin login succeeded." -ForegroundColor Green

# ------------------------------------------------------------------
# 2. Create a dedicated test client + client user
# ------------------------------------------------------------------
$suffix      = [guid]::NewGuid().ToString("N").Substring(0, 8)
$clientName  = "Correlation Smoke $suffix"
$clientEmail = "client.$suffix@hunter.local"

$createdClient = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/clients" -Headers $authHeaders -Body @{
    name    = $clientName
    vpn_ip  = "10.77.0.10"
    api_key = "correlation-smoke-$suffix"
}
if (-not $createdClient.id) { throw "Client creation failed." }
Write-Host "[OK] Client created: $($createdClient.id)" -ForegroundColor Green

$clientUser = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/clients/$($createdClient.id)/users" -Headers $authHeaders -Body @{
    email     = $clientEmail
    password  = $ClientUserPassword
    is_active = $true
}
if ($clientUser.role -ne "client") { throw "Client user creation failed (role=$($clientUser.role))." }
Write-Host "[OK] Client user created: $clientEmail" -ForegroundColor Green

# ------------------------------------------------------------------
# 3. Ingest client logs containing the IoCs we will hunt for
# ------------------------------------------------------------------
$sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

$ingestResponse = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/clients/$($createdClient.id)/logs/ingest" -Headers $authHeaders -Body @{
    logs = @(
        @{
            timestamp   = (Get-Date).ToUniversalTime().ToString("o")
            message     = "Proxy observed callback to https://login.badcorp-secure.com/update from FIN-WKS-22 with destination 198.51.100.77 and sha256 $sha256."
            hostname    = "FIN-WKS-22"
            ip_address  = "10.10.5.22"
            source      = "web_proxy"
            event_type  = "proxy"
            asset_type  = "workstation"
            os          = "Windows 11"
            external_id = "proxy-smoke-$suffix"
        },
        @{
            timestamp   = (Get-Date).ToUniversalTime().AddMinutes(-2).ToString("o")
            message     = "Email gateway saw sender alerts@badcorp-secure.com referencing CVE-2026-12345 and host login.badcorp-secure.com."
            hostname    = "FIN-WKS-22"
            ip_address  = "10.10.5.22"
            source      = "email_gateway"
            event_type  = "mail"
            asset_type  = "workstation"
            os          = "Windows 11"
            external_id = "mail-smoke-$suffix"
        }
    )
}
if ($ingestResponse.ingested_count -ne 2) {
    throw "Log ingestion failed: expected 2 documents, got $($ingestResponse.ingested_count)."
}
Write-Host "[OK] Client logs ingested: $($ingestResponse.ingested_count) documents -> index $($ingestResponse.index_name)" -ForegroundColor Green

# ------------------------------------------------------------------
# 4. Verify the logs are indexed and IoCs were extracted
# ------------------------------------------------------------------
Start-Sleep -Seconds 2
$recentLogs = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/clients/$($createdClient.id)/logs/recent?limit=10" -Headers $authHeaders
if (-not $recentLogs -or $recentLogs.Count -lt 1) {
    throw "Recent log lookup returned no results."
}
if (-not $recentLogs[0].indicator_values -or $recentLogs[0].indicator_values.Count -lt 1) {
    throw "Indexed log has no extracted indicator_values -- IoC extraction during ingestion failed."
}
$allIndicators = ($recentLogs | ForEach-Object { $_.indicator_values }) -join ", "
Write-Host "[OK] Log index verified. Sample indicators: $allIndicators" -ForegroundColor Green

# ------------------------------------------------------------------
# 5. Trigger a FULL_HUNT scoped to this client
#    seed_text contains the same IoCs as the ingested logs so
#    correlation will fire. No external source_id is needed.
# ------------------------------------------------------------------
$seedText = "Analysts observed credential phishing infrastructure at https://login.badcorp-secure.com/update resolving to 198.51.100.77. The payload hash SHA256 is $sha256. The sender alerts@badcorp-secure.com was linked to CVE-2026-12345."

$hunt = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/hunting" -Headers $authHeaders -Body @{
    type      = "full_hunt"
    client_id = $createdClient.id
    theme     = "phishing"
    seed_text = $seedText
}
if (-not $hunt.id) { throw "Hunt creation failed." }
Write-Host "[OK] Hunt created: $($hunt.id)" -ForegroundColor Green

# ------------------------------------------------------------------
# 6. Poll until terminal state
# ------------------------------------------------------------------
Write-Host "    Waiting for hunt to complete (timeout: $TimeoutSeconds s)..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$job = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $job = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/hunting/$($hunt.id)" -Headers $authHeaders
    Write-Host "    Status: $($job.status)" -ForegroundColor DarkGray
    if ($job.status -in @("success", "failed")) { break }
}

if ($null -eq $job)              { throw "Hunt polling returned no response." }
if ($job.status -eq "failed")    { throw "Hunt failed: $($job.error_message)" }
if ($job.status -ne "success")   { throw "Hunt timed out after $TimeoutSeconds s -- still '$($job.status)'." }

Write-Host "[OK] Hunt succeeded." -ForegroundColor Green

# ------------------------------------------------------------------
# 7. Verify correlation produced at least one alert
# ------------------------------------------------------------------
$alertsCreated = $job.result_summary.alerts_created
if ($alertsCreated -lt 1) {
    throw "Expected at least 1 correlated alert, got $alertsCreated. Check that Elasticsearch ingested the logs and IoCs matched."
}
Write-Host "[OK] Correlation produced $alertsCreated alert(s)." -ForegroundColor Green

# ------------------------------------------------------------------
# 8. Admin view: alerts + report + PDF download URL
# ------------------------------------------------------------------
$adminAlerts = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/alerts?client_id=$($createdClient.id)" -Headers $authHeaders
if (-not $adminAlerts -or $adminAlerts.Count -lt 1) {
    throw "Admin alert list returned no alerts for this client."
}
Write-Host "[OK] Admin sees $($adminAlerts.Count) alert(s)." -ForegroundColor Green

$adminReports = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/reports?client_id=$($createdClient.id)" -Headers $authHeaders
if (-not $adminReports -or $adminReports.Count -lt 1) {
    throw "Admin report list returned no reports for this client."
}
Write-Host "[OK] Admin sees $($adminReports.Count) report(s)." -ForegroundColor Green

$download = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/reports/$($adminReports[0].id)/download" -Headers $authHeaders
if (-not $download.download_url) {
    throw "Report download URL was not generated."
}
Write-Host "[OK] Report download URL generated." -ForegroundColor Green

# ------------------------------------------------------------------
# 9. Client view: verify the client user sees their own data
# ------------------------------------------------------------------
$clientLogin = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email    = $clientEmail
    password = $ClientUserPassword
}
if (-not $clientLogin.access_token) { throw "Client user login failed." }
$clientHeaders = @{ Authorization = "Bearer $($clientLogin.access_token)" }
Write-Host "[OK] Client user logged in." -ForegroundColor Green

$clientAlerts = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/client/alerts" -Headers $clientHeaders
if (-not $clientAlerts -or $clientAlerts.Count -lt 1) {
    throw "Client alert visibility failed -- client sees no alerts."
}
Write-Host "[OK] Client sees $($clientAlerts.Count) alert(s)." -ForegroundColor Green

$clientReports = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/client/reports" -Headers $clientHeaders
if (-not $clientReports -or $clientReports.Count -lt 1) {
    throw "Client report visibility failed -- client sees no reports."
}
Write-Host "[OK] Client sees $($clientReports.Count) report(s)." -ForegroundColor Green

# ------------------------------------------------------------------
# 10. Summary
# ------------------------------------------------------------------
Write-Host ""
Write-Host "Phase 4 correlation smoke test PASSED." -ForegroundColor Cyan
Write-Host "  - Log ingestion (Elasticsearch):  OK"
Write-Host "  - IoC extraction from logs:        OK"
Write-Host "  - Full hunt + correlation:         OK ($alertsCreated alert(s))"
Write-Host "  - PDF report generation (MinIO):   OK"
Write-Host "  - Admin RBAC visibility:           OK"
Write-Host "  - Client RBAC visibility:          OK"
Write-Host ""
Write-Host "  Client ID:   $($createdClient.id)"
Write-Host "  Client user: $clientEmail"

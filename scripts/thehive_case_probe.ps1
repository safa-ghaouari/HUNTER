param(
    [string]$TheHiveBaseUrl = "http://localhost:9000",
    [string]$AdminLogin = "admin@thehive.local",
    [string]$AdminPassword = "secret",
    [string]$OrganisationName = "hunter-probe-org",
    [string]$ProbeUserLogin = "probe.orgadmin@hunter.local",
    [string]$ProbeUserName = "Probe Org Admin",
    [string]$ProbeUserPassword = "HunterProbeOrgAdmin2026!"
)

$ErrorActionPreference = "Stop"

function Get-BasicAuthHeader {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Login,
        [Parameter(Mandatory = $true)]
        [string]$Password
    )

    $pair = "$Login`:$Password"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    return @{ Authorization = "Basic $encoded" }
}

function Invoke-TheHiveRequest {
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

function Invoke-TheHiveRequestWithDetails {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST", "PATCH")]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [hashtable]$Headers,
        $Body
    )

    try {
        $response = Invoke-TheHiveRequest -Method $Method -Uri $Uri -Headers $Headers -Body $Body
        return [pscustomobject]@{
            success = $true
            data = $response
            error = $null
        }
    }
    catch {
        $errorResponse = $_.ErrorDetails.Message
        if (-not $errorResponse) {
            $errorResponse = $_.Exception.Message
        }
        return [pscustomobject]@{
            success = $false
            data = $null
            error = $errorResponse
        }
    }
}

Write-Host "TheHive case probe starting..." -ForegroundColor Cyan

$publicStatus = Invoke-TheHiveRequest -Method GET -Uri "$TheHiveBaseUrl/api/v1/status/public"
Write-Host "Public status endpoint succeeded." -ForegroundColor Green

$adminHeaders = Get-BasicAuthHeader -Login $AdminLogin -Password $AdminPassword
$adminCurrentUser = Invoke-TheHiveRequest -Method GET -Uri "$TheHiveBaseUrl/api/user/current" -Headers $adminHeaders
Write-Host "Admin authentication succeeded: $($adminCurrentUser.login)" -ForegroundColor Green

$adminApiKey = Invoke-TheHiveRequest -Method POST -Uri "$TheHiveBaseUrl/api/user/$([uri]::EscapeDataString($AdminLogin))/key/renew" -Headers $adminHeaders
Write-Host "Admin API key renewed." -ForegroundColor Green

$organisationLookup = Invoke-TheHiveRequestWithDetails -Method GET -Uri "$TheHiveBaseUrl/api/organisation/$OrganisationName" -Headers $adminHeaders
if ($organisationLookup.success) {
    $organisation = $organisationLookup.data
    Write-Host "Organisation already exists: $OrganisationName" -ForegroundColor Green
}
else {
    $organisationCreate = Invoke-TheHiveRequestWithDetails -Method POST -Uri "$TheHiveBaseUrl/api/organisation" -Headers $adminHeaders -Body @{
        name = $OrganisationName
        description = "Probe organisation for HUNTER TheHive validation"
        taskRule = "manual"
        observableRule = "manual"
    }

    if (-not $organisationCreate.success) {
        Write-Host "Organisation bootstrap is blocked." -ForegroundColor Yellow
        [pscustomobject]@{
            public_status_version = $publicStatus.version
            admin_login = $adminCurrentUser.login
            admin_api_key_renewed = [bool]$adminApiKey
            organisation_name = $OrganisationName
            organisation_id = $null
            probe_user_login = $null
            probe_user_type = $null
            probe_user_org = $null
            case_creation_success = $false
            case_creation_error = $organisationCreate.error
        } | ConvertTo-Json -Depth 10

        Write-Host "TheHive case probe completed." -ForegroundColor Cyan
        exit 0
    }

    $organisation = $organisationCreate.data
    Write-Host "Organisation created: $OrganisationName" -ForegroundColor Green
}

$probeUserLookup = Invoke-TheHiveRequestWithDetails -Method GET -Uri "$TheHiveBaseUrl/api/user/$([uri]::EscapeDataString($ProbeUserLogin))" -Headers $adminHeaders
if ($probeUserLookup.success) {
    $probeUser = $probeUserLookup.data
    Write-Host "Probe user already exists: $ProbeUserLogin" -ForegroundColor Green
}
else {
    $probeUser = Invoke-TheHiveRequest -Method POST -Uri "$TheHiveBaseUrl/api/user" -Headers $adminHeaders -Body @{
        login = $ProbeUserLogin
        name = $ProbeUserName
        password = $ProbeUserPassword
        profile = "org-admin"
        organisation = $OrganisationName
        type = "Normal"
    }
    Write-Host "Probe user created: $ProbeUserLogin" -ForegroundColor Green
}

$probeUserApiKey = Invoke-TheHiveRequest -Method POST -Uri "$TheHiveBaseUrl/api/user/$([uri]::EscapeDataString($ProbeUserLogin))/key/renew" -Headers $adminHeaders
Write-Host "Probe user API key renewed." -ForegroundColor Green

$probeHeaders = @{
    Authorization = "Bearer $probeUserApiKey"
    "X-Organisation" = $OrganisationName
}

$probeCurrentUser = Invoke-TheHiveRequest -Method GET -Uri "$TheHiveBaseUrl/api/user/current" -Headers $probeHeaders
Write-Host "Probe user current organisation: $($probeCurrentUser.organisation)" -ForegroundColor Green

$caseProbe = Invoke-TheHiveRequestWithDetails -Method POST -Uri "$TheHiveBaseUrl/api/case" -Headers @{
    Authorization = "Bearer $probeUserApiKey"
    "X-Organisation" = $OrganisationName
} -Body @{
    title = "HUNTER probe case"
    description = "Validating automated TheHive case creation from HUNTER."
    severity = 2
    tlp = 2
    pap = 2
    tags = @("hunter-probe")
}

if ($caseProbe.success) {
    Write-Host "Case creation succeeded." -ForegroundColor Green
}
else {
    Write-Host "Case creation is still blocked." -ForegroundColor Yellow
}

[pscustomobject]@{
    public_status_version = $publicStatus.version
    admin_login = $adminCurrentUser.login
    admin_api_key_renewed = [bool]$adminApiKey
    organisation_name = $organisation.name
    organisation_id = $organisation.id
    probe_user_login = $probeUser.login
    probe_user_type = $probeUser.type
    probe_user_org = $probeCurrentUser.organisation
    case_creation_success = $caseProbe.success
    case_creation_error = $caseProbe.error
} | ConvertTo-Json -Depth 10

Write-Host "TheHive case probe completed." -ForegroundColor Cyan

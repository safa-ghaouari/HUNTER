param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8000",
    [string]$GatewayBaseUrl = "http://127.0.0.1",
    [string]$TlsGatewayBaseUrl = "https://127.0.0.1",
    [string]$VaultBaseUrl = "http://127.0.0.1:8200",
    [string]$AdminEmail = "soc.admin@hunter.local",
    [string]$AdminPassword = "HunterAdmin2026Secure",
    [string]$VaultToken = "hunter-vault-root-token-2026"
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST", "DELETE")]
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

function Enable-InsecureTlsForLocalhost {
    if (-not ([System.Management.Automation.PSTypeName]"ServerCertificateValidationCallback").Type) {
        Add-Type @"
using System;
using System.Net;
using System.Security.Cryptography.X509Certificates;

public static class ServerCertificateValidationCallback {
    public static void Ignore() {
        ServicePointManager.ServerCertificateValidationCallback +=
            delegate(
                Object obj,
                X509Certificate certificate,
                X509Chain chain,
                System.Net.Security.SslPolicyErrors errors
            ) {
                return true;
            };
    }
}
"@
    }

    [ServerCertificateValidationCallback]::Ignore()
}

function Invoke-LocalHttpsJsonRequest {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST", "DELETE")]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        $Body
    )

    $encodedBody = ""
    if ($null -ne $Body) {
        $encodedBody = $Body | ConvertTo-Json -Depth 10 -Compress
    }

    $env:HUNTER_HTTPS_METHOD = $Method
    $env:HUNTER_HTTPS_URL = $Uri
    $env:HUNTER_HTTPS_BODY = $encodedBody

    try {
        $response = @'
import json
import os
import ssl
import urllib.request

method = os.environ["HUNTER_HTTPS_METHOD"]
url = os.environ["HUNTER_HTTPS_URL"]
body = os.environ.get("HUNTER_HTTPS_BODY", "")
data = body.encode("utf-8") if body else None

request = urllib.request.Request(url, data=data, method=method)
if data is not None:
    request.add_header("Content-Type", "application/json")

context = ssl._create_unverified_context()
with urllib.request.urlopen(request, context=context, timeout=15) as response:
    print(response.read().decode("utf-8"))
'@ | python -

        return $response | ConvertFrom-Json
    }
    finally {
        Remove-Item Env:HUNTER_HTTPS_METHOD, Env:HUNTER_HTTPS_URL, Env:HUNTER_HTTPS_BODY -ErrorAction SilentlyContinue
    }
}

function Get-LocalHttpsStatusCode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri
    )

    $env:HUNTER_HTTPS_STATUS_URL = $Uri
    try {
        $statusCode = @'
import os
import ssl
import urllib.error
import urllib.request

url = os.environ["HUNTER_HTTPS_STATUS_URL"]
request = urllib.request.Request(url, method="GET")
context = ssl._create_unverified_context()

try:
    with urllib.request.urlopen(request, context=context, timeout=15) as response:
        print(response.status)
except urllib.error.HTTPError as exc:
    print(exc.code)
'@ | python -

        return [int]$statusCode
    }
    finally {
        Remove-Item Env:HUNTER_HTTPS_STATUS_URL -ErrorAction SilentlyContinue
    }
}

Write-Host "Phase 1 smoke test starting..." -ForegroundColor Cyan
Enable-InsecureTlsForLocalhost

$loginResponse = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}

if (-not $loginResponse.access_token) {
    throw "Login failed: no access token returned."
}

$authHeaders = @{
    Authorization = "Bearer $($loginResponse.access_token)"
}

Write-Host "Admin login succeeded." -ForegroundColor Green

$gatewayLoginResponse = Invoke-JsonRequest -Method POST -Uri "$GatewayBaseUrl/api/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}

if (-not $gatewayLoginResponse.access_token) {
    throw "Gateway login failed: nginx prefix routing is not working."
}

Write-Host "Nginx API routing succeeded." -ForegroundColor Green

$tlsGatewayLoginResponse = Invoke-LocalHttpsJsonRequest -Method POST -Uri "$TlsGatewayBaseUrl/api/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}

if (-not $tlsGatewayLoginResponse.access_token) {
    throw "HTTPS gateway login failed: TLS nginx routing is not working."
}

Write-Host "Nginx TLS routing succeeded." -ForegroundColor Green

$metricsResponse = Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl/metrics" -Method GET -ErrorAction Stop
if ($metricsResponse.StatusCode -ne 200 -or $metricsResponse.Content -notmatch "python_gc_objects_collected_total") {
    throw "Metrics endpoint did not return the expected Prometheus payload."
}

Write-Host "Metrics endpoint succeeded." -ForegroundColor Green

$wafStatusCode = Get-LocalHttpsStatusCode -Uri "$TlsGatewayBaseUrl/api/metrics?attack=<script>alert(1)</script>"

if ($wafStatusCode -ne 403) {
    throw "ModSecurity did not block the malicious probe as expected."
}

Write-Host "ModSecurity WAF probe succeeded." -ForegroundColor Green

$suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$clientName = "Smoke Client $suffix"
$clientApiKey = "smoke-api-key-$suffix"

$createdClient = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/clients" -Headers $authHeaders -Body @{
    name   = $clientName
    vpn_ip = "10.20.30.40"
    api_key = $clientApiKey
}

if (-not $createdClient.id) {
    throw "Client creation failed."
}

Write-Host "Client creation succeeded: $($createdClient.id)" -ForegroundColor Green

$clientList = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/clients" -Headers $authHeaders
if (-not ($clientList | Where-Object { $_.id -eq $createdClient.id })) {
    throw "Created client was not found in client listing."
}

$clientDetails = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/clients/$($createdClient.id)" -Headers $authHeaders
if ($clientDetails.name -ne $clientName) {
    throw "Fetched client details do not match the created client."
}

Write-Host "Client listing and retrieval succeeded." -ForegroundColor Green

$vaultHeaders = @{
    "X-Vault-Token" = $VaultToken
}

$vaultSecret = Invoke-JsonRequest -Method GET -Uri "$VaultBaseUrl/v1/secret/data/clients/$($createdClient.id)" -Headers $vaultHeaders
if ($vaultSecret.data.data.api_key -ne $clientApiKey) {
    throw "Vault secret check failed for created client."
}

Write-Host "Vault secret write succeeded." -ForegroundColor Green

$deletedClient = Invoke-JsonRequest -Method DELETE -Uri "$ApiBaseUrl/admin/clients/$($createdClient.id)" -Headers $authHeaders
if ($deletedClient.is_active -ne $false) {
    throw "Soft delete failed: client is still active."
}

Write-Host "Client soft delete succeeded." -ForegroundColor Green
Write-Host "Phase 1 smoke test completed successfully." -ForegroundColor Cyan

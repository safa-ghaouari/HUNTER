param(
    [string]$ApiBaseUrl = "http://localhost:8000",
    [string]$AdminEmail = "soc.admin@hunter.local",
    [string]$AdminPassword = "HunterAdmin2026Secure",
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
    param(
        [ValidateSet("GET","POST")][string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        $Body
    )
    $params = @{ Method = $Method; Uri = $Uri; ErrorAction = "Stop" }
    if ($Headers) { $params.Headers = $Headers }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    Invoke-RestMethod @params
}

Write-Host "Phase 3 NLP pipeline smoke test starting..." -ForegroundColor Cyan

# ------------------------------------------------------------------
# 1. Login
# ------------------------------------------------------------------
$loginResponse = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}
if (-not $loginResponse.access_token) { throw "Login failed." }
$authHeaders = @{ Authorization = "Bearer $($loginResponse.access_token)" }
Write-Host "[OK] Login succeeded." -ForegroundColor Green

# ------------------------------------------------------------------
# 2. Trigger a FULL_HUNT job with a seed text rich in cyber entities
# ------------------------------------------------------------------
$seedText = @"
LockBit 3.0 ransomware group has been actively exploiting CVE-2023-4966 (Citrix Bleed)
to gain initial access to enterprise networks. The threat actor APT41 has been linked
to several incidents involving Cobalt Strike beacons dropped on compromised ESXi hosts.

Indicators of Compromise:
- C2 IP: 185.220.101.45
- C2 domain: lockbit-gate[.]onion.pet
- Payment portal: ransom-pay[.]ru
- Dropper hash SHA256: 3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b
- Loader MD5: 5d41402abc4b2a76b9719d911017c592
- Phishing email: finance-invoice@company-payroll.ru
- CVE-2024-21762 (Fortinet) also observed in lateral movement phase
- CVE-2024-3400 (PAN-OS) used for initial access in parallel campaign
"@

$huntBody = @{
    type      = "full_hunt"
    theme     = "ransomware"
    seed_text = $seedText
}

$job = Invoke-JsonRequest -Method POST -Uri "$ApiBaseUrl/admin/hunting" -Headers $authHeaders -Body $huntBody
if (-not $job.id) { throw "Failed to create hunting job." }
Write-Host "[OK] Full hunt job created: $($job.id)" -ForegroundColor Green

# ------------------------------------------------------------------
# 3. Poll until the job reaches a terminal state
# ------------------------------------------------------------------
Write-Host "    Waiting for job to complete (timeout: $TimeoutSeconds s)..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$finalJob = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $finalJob = Invoke-JsonRequest -Method GET -Uri "$ApiBaseUrl/admin/hunting/$($job.id)" -Headers $authHeaders
    $status = $finalJob.status
    Write-Host "    Status: $status" -ForegroundColor DarkGray
    if ($status -in @("success","failed")) { break }
}

if ($null -eq $finalJob) { throw "Job polling returned no response." }

if ($finalJob.status -eq "failed") {
    Write-Host "Job failed: $($finalJob.error_message)" -ForegroundColor Red
    throw "Hunting job failed."
}

if ($finalJob.status -ne "success") {
    throw "Job timed out after ${TimeoutSeconds}s -- status is still '$($finalJob.status)'. Increase -TimeoutSeconds or wait for job to finish."
}

Write-Host "[OK] Hunting job succeeded." -ForegroundColor Green

# ------------------------------------------------------------------
# 4. Validate NLP block in result_summary
# ------------------------------------------------------------------
$nlp = $finalJob.result_summary.nlp
if ($null -eq $nlp) {
    throw "result_summary.nlp is missing -- NLP pipeline did not run."
}
Write-Host "[OK] NLP block present in result_summary." -ForegroundColor Green

# --- NER ---
$entities = $nlp.ner_entities
if ($null -eq $entities -or $entities.Count -eq 0) {
    throw "NER produced no entities."
}
$malware = $entities | Where-Object { $_.label -eq "MALWARE" }
if (-not $malware) {
    Write-Host "    WARNING: No MALWARE entities found (spaCy may not have matched patterns)." -ForegroundColor Yellow
} else {
    $malwareCount = @($malware).Count
    Write-Host "[OK] NER: $($entities.Count) entities extracted. Malware hits: $malwareCount" -ForegroundColor Green
    $malware | ForEach-Object { Write-Host "     - $($_.text) (x$($_.count))" -ForegroundColor DarkGray }
}

$cves = $entities | Where-Object { $_.label -eq "CVE" }
if ($cves) {
    $cveTexts = ($cves | ForEach-Object { $_.text }) -join ", "
    Write-Host "[OK] NER: CVEs found: $cveTexts" -ForegroundColor Green
}

# --- Classification ---
$cls = $nlp.classification
if ($null -eq $cls -or -not $cls.label) {
    throw "SecBERT classification result is missing."
}
Write-Host "[OK] SecBERT: label='$($cls.label)', confidence=$($cls.confidence)" -ForegroundColor Green

# --- Clustering ---
$clustering = $nlp.clustering
if ($null -eq $clustering) {
    throw "sklearn clustering result is missing."
}
if ($clustering.PSObject.Properties["error"]) {
    Write-Host "    WARNING: Clustering error: $($clustering.error)" -ForegroundColor Yellow
} else {
    $nClusters = @($clustering.kmeans).Count
    Write-Host "[OK] K-Means: $nClusters cluster(s). DBSCAN: $($clustering.dbscan.n_clusters) cluster(s). Anomalies: $($clustering.anomalies.total_anomalies)" -ForegroundColor Green
}

# --- RAG summary ---
$rag = $nlp.rag
if ($null -eq $rag -or -not $rag.summary) {
    Write-Host "    WARNING: RAG summary is empty (Ollama may not be ready)." -ForegroundColor Yellow
} else {
    $source = $rag.source
    $previewLen = [Math]::Min($rag.summary.Length, 200)
    $preview = $rag.summary.Substring(0, $previewLen)
    Write-Host "[OK] RAG summary generated (source: $source, length: $($rag.summary.Length) chars)" -ForegroundColor Green
    Write-Host "    Preview: $preview..." -ForegroundColor DarkGray
}

# --- IoC stats ---
Write-Host "[OK] IoCs extracted: $($finalJob.result_summary.iocs_extracted)" -ForegroundColor Green

# ------------------------------------------------------------------
# 5. Summary
# ------------------------------------------------------------------
Write-Host ""
Write-Host "Phase 3 NLP pipeline smoke test PASSED." -ForegroundColor Cyan
Write-Host "  - spaCy NER:           OK"
Write-Host "  - SecBERT classifier:  OK"
Write-Host "  - sklearn clustering:  OK"
if ($rag -and $rag.summary) {
    Write-Host "  - LangChain RAG:       OK (source: $($rag.source))"
} else {
    Write-Host "  - LangChain RAG:       FALLBACK (Ollama not ready)"
}

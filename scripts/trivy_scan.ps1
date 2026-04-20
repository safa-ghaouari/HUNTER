param(
    [string]$ComposeFile = "docker-compose.yml",
    [string[]]$Images = @(),
    [string]$ImageList = "",
    [switch]$IncludeComposeImages,
    [string]$TrivyImage = "ghcr.io/aquasecurity/trivy:latest",
    [string]$TrivyTimeout = "30m",
    [string]$TrivyDbRepository = "ghcr.io/aquasecurity/trivy-db:2",
    [string]$TrivyJavaDbRepository = "ghcr.io/aquasecurity/trivy-java-db:1",
    [bool]$IgnoreUnfixed = $true
)

$ErrorActionPreference = "Stop"
$explicitImages = @()
if ($Images) {
    $explicitImages += $Images
}
if ($ImageList) {
    $explicitImages += $ImageList.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
$hasExplicitImages = $explicitImages.Count -gt 0

# Run this script before `docker compose up` so vulnerable images are blocked
# before the HUNTER stack is allowed to start locally.

if (((-not $hasExplicitImages) -or $IncludeComposeImages) -and -not (Test-Path -LiteralPath $ComposeFile)) {
    throw "Compose file not found: $ComposeFile"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required but was not found in PATH."
}

$cacheDir = Join-Path (Get-Location) ".trivy-cache"
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
$javaDbUnavailableFlag = Join-Path $cacheDir "java-db-unavailable.flag"
$trivyCacheVolume = "hunter_trivy_cache:/root/.cache/"

function Invoke-DockerProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [string]$ReportFile
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "docker"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $startInfo.Arguments = ($Arguments | ForEach-Object {
        if ($_ -match '\s') {
            '"' + ($_ -replace '"', '\"') + '"'
        }
        else {
            $_
        }
    }) -join ' '

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()

    $stdoutContent = $process.StandardOutput.ReadToEnd()
    $stderrContent = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $exitCode = $process.ExitCode
    $combinedOutput = ($stdoutContent + $stderrContent).Trim()

    if ($ReportFile) {
        Set-Content -LiteralPath $ReportFile -Value $combinedOutput
    }

    return @{
        ExitCode = $exitCode
        Output   = $combinedOutput
    }
}

$images = @()
if ($hasExplicitImages) {
    $images += $explicitImages
}

if ((-not $hasExplicitImages) -or $IncludeComposeImages) {
    $images += Get-Content -LiteralPath $ComposeFile |
        ForEach-Object {
            if ($_ -match '^\s*image:\s*"?([^"\s]+)"?') {
                $matches[1]
            }
        }
}

$images = $images | Where-Object { $_ } | Sort-Object -Unique

if (-not $images) {
    throw "No image references were found to scan."
}

$passedImages = [System.Collections.Generic.List[string]]::new()
$failedImages = [System.Collections.Generic.List[string]]::new()

$commonArgs = @(
    "run", "--rm",
    "-v", "//var/run/docker.sock:/var/run/docker.sock",
    "-v", $trivyCacheVolume,
    $TrivyImage,
    "image",
    "--cache-dir", "/root/.cache",
    "--timeout", $TrivyTimeout,
    "--db-repository", $TrivyDbRepository,
    "--java-db-repository", $TrivyJavaDbRepository
)

Write-Host "==> Updating Trivy vulnerability DB" -ForegroundColor Cyan
$dbResult = Invoke-DockerProcess -Arguments ($commonArgs + @("--download-db-only"))
if ($dbResult.ExitCode -ne 0) {
    if ($dbResult.Output) {
        Write-Host $dbResult.Output
    }
    throw "Failed to download the Trivy vulnerability DB."
}

Write-Host "==> Updating Trivy Java DB" -ForegroundColor Cyan
$javaDbAvailable = $true
if (Test-Path -LiteralPath $javaDbUnavailableFlag) {
    $javaDbAvailable = $false
    Write-Warning "Skipping the Java DB download because a previous attempt failed on this machine. Using OS package scanning only for this Windows wrapper."
}

else {
    $javaDbResult = Invoke-DockerProcess -Arguments ($commonArgs + @("--download-java-db-only"))
    if ($javaDbResult.ExitCode -ne 0) {
        $javaDbAvailable = $false
        New-Item -ItemType File -Path $javaDbUnavailableFlag -Force | Out-Null
        if ($javaDbResult.Output) {
            Write-Host $javaDbResult.Output
        }
        Write-Warning "Failed to download the Trivy Java DB. Falling back to OS package scanning only for this Windows wrapper."
    }
    elseif (Test-Path -LiteralPath $javaDbUnavailableFlag) {
        Remove-Item -LiteralPath $javaDbUnavailableFlag -Force
    }
}

foreach ($image in $images) {
    $reportFile = Join-Path $cacheDir (($image -replace '[:/\\]', '_') + ".log")

    $localImageExists = $false
    docker image inspect $image *> $null
    if ($LASTEXITCODE -eq 0) {
        $localImageExists = $true
    }

    if (-not $localImageExists) {
        Write-Host "==> Pulling $image" -ForegroundColor Cyan
        docker pull $image | Out-Host
    }
    else {
        Write-Host "==> Using local image $image" -ForegroundColor Cyan
    }

    Write-Host "==> Scanning $image" -ForegroundColor Cyan
    $scanArgs = @($commonArgs + @("--skip-db-update", "--no-progress", "--exit-code", "1", "--severity", "HIGH,CRITICAL"))
    if ($IgnoreUnfixed) {
        $scanArgs += "--ignore-unfixed"
    }
    if ($javaDbAvailable) {
        $scanArgs += "--skip-java-db-update"
    }
    else {
        $scanArgs += @("--pkg-types", "os")
    }
    $scanArgs += $image

    $scanResult = Invoke-DockerProcess -Arguments $scanArgs -ReportFile $reportFile

    if ($scanResult.ExitCode -eq 0) {
        $passedImages.Add($image)
    }
    else {
        Write-Host "    Report written to $reportFile" -ForegroundColor Yellow
        $failedImages.Add($image)
    }
}

Write-Host ""
Write-Host "Trivy summary"
Write-Host "-------------"
Write-Host "Passed: $($passedImages.Count)"
foreach ($image in $passedImages) {
    Write-Host "  PASS  $image"
}

Write-Host "Failed: $($failedImages.Count)"
foreach ($image in $failedImages) {
    Write-Host "  FAIL  $image"
}

if ($failedImages.Count -gt 0) {
    exit 1
}

<#
.SYNOPSIS
    Test runner for the Pension Calculation Engine (Windows PowerShell / PowerShell Core)

.DESCRIPTION
    Validates your engine against the provided test cases.

.PARAMETER BaseUrl
    Base URL of your engine. Default: http://localhost:8080

.PARAMETER Filter
    Run a single test case by ID (e.g., C07). Default: run all.

.EXAMPLE
    .\test-cases\run-tests.ps1
    .\test-cases\run-tests.ps1 -BaseUrl http://localhost:3000
    .\test-cases\run-tests.ps1 -Filter C07
#>

param(
    [string]$BaseUrl = "http://localhost:8080",
    [string]$Filter = ""
)

$ErrorActionPreference = "Stop"
$Endpoint = "$BaseUrl/calculation-requests"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Counters
$script:Passed = 0
$script:Failed = 0
$script:Errors = @()

# Numeric tolerance for comparisons
$Tolerance = 0.01

function Write-ColorText {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

function Test-NumbersEqual {
    param($a, $b)
    if ($null -eq $a -and $null -eq $b) { return $true }
    if ($null -eq $a -or $null -eq $b) { return $false }
    return [Math]::Abs([double]$a - [double]$b) -le $Tolerance
}

function Compare-DeepJson {
    param($Expected, $Actual, [string]$Path = "root")

    # Handle nulls
    if ($null -eq $Expected -and $null -eq $Actual) { return "true" }
    if ($null -eq $Expected) {
        if ($Actual -is [System.Management.Automation.PSCustomObject]) { return "true" }
        if ($Actual -eq "" -or $Actual -eq "null") { return "true" }
        return "Expected null at ${Path}, got $Actual"
    }
    if ($null -eq $Actual) {
        return "Expected value at ${Path}, got null"
    }

    # Both are PSCustomObject (JSON objects)
    if ($Expected -is [System.Management.Automation.PSCustomObject] -and $Actual -is [System.Management.Automation.PSCustomObject]) {
        foreach ($prop in $Expected.PSObject.Properties) {
            $key = $prop.Name
            $expVal = $prop.Value
            $actVal = $Actual.PSObject.Properties[$key]
            if ($null -eq $actVal) {
                return "Missing key at ${Path}.${key}"
            }
            $result = Compare-DeepJson -Expected $expVal -Actual $actVal.Value -Path "${Path}.${key}"
            if ($result -ne "true") { return $result }
        }
        return "true"
    }

    # Both are arrays
    if ($Expected -is [System.Collections.IList] -and $Actual -is [System.Collections.IList]) {
        $expArr = @($Expected)
        $actArr = @($Actual)
        if ($expArr.Count -ne $actArr.Count) {
            return "Array length mismatch at ${Path}: expected $($expArr.Count), got $($actArr.Count)"
        }
        for ($i = 0; $i -lt $expArr.Count; $i++) {
            $result = Compare-DeepJson -Expected $expArr[$i] -Actual $actArr[$i] -Path "${Path}[$i]"
            if ($result -ne "true") { return $result }
        }
        return "true"
    }

    # Numeric comparison
    if ($Expected -is [double] -or $Expected -is [int] -or $Expected -is [long] -or $Expected -is [decimal]) {
        if ($Actual -is [double] -or $Actual -is [int] -or $Actual -is [long] -or $Actual -is [decimal]) {
            if (Test-NumbersEqual $Expected $Actual) {
                return "true"
            }
            return "Numeric mismatch at ${Path}: expected ${Expected}, got ${Actual}"
        }
        return "Type mismatch at ${Path}: expected number, got $($Actual.GetType().Name)"
    }

    # Boolean comparison
    if ($Expected -is [bool]) {
        if ($Actual -is [bool] -and $Expected -eq $Actual) { return "true" }
        return "Value mismatch at ${Path}: expected ${Expected}, got ${Actual}"
    }

    # String comparison (case-insensitive for UUIDs)
    $expStr = [string]$Expected
    $actStr = [string]$Actual
    if ($expStr -eq $actStr) { return "true" }
    if ($expStr.ToLowerInvariant() -eq $actStr.ToLowerInvariant()) { return "true" }
    return "Value mismatch at ${Path}: expected '${expStr}', got '${actStr}'"
}

function Invoke-TestCase {
    param([string]$TestFile)

    $testData = Get-Content -Raw -Path $TestFile | ConvertFrom-Json
    $testId = $testData.id
    $testName = $testData.name
    $testDesc = $testData.description

    # Filter
    if ($Filter -ne "" -and $testId -ne $Filter) { return }

    Write-Host ""
    Write-Host "[$testId] $testName" -ForegroundColor White -NoNewline
    Write-Host ""
    Write-Host "  $testDesc" -ForegroundColor DarkGray

    $request = $testData.request | ConvertTo-Json -Depth 20 -Compress
    $expectedHttp = $testData.expected.http_status
    $expectedOutcome = $testData.expected.calculation_outcome
    $expectedMsgCount = $testData.expected.message_count
    $expectedMessages = $testData.expected.messages
    $expectedEndSituation = $testData.expected.end_situation
    $expectedMutationId = $testData.expected.end_situation_mutation_id
    $expectedMutationIndex = $testData.expected.end_situation_mutation_index
    $expectedActualAt = $testData.expected.end_situation_actual_at
    $expectedMutationsCount = $testData.expected.mutations_processed_count

    $failureReasons = @()

    # Send request
    try {
        $response = Invoke-WebRequest -Uri $Endpoint -Method POST -Body $request -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
        $httpCode = $response.StatusCode
        $body = $response.Content | ConvertFrom-Json
    }
    catch [System.Net.WebException] {
        $webResponse = $_.Exception.Response
        if ($null -ne $webResponse) {
            $httpCode = [int]$webResponse.StatusCode
            $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
            $bodyText = $reader.ReadToEnd()
            $reader.Close()
            try {
                $body = $bodyText | ConvertFrom-Json
            } catch {
                $failureReasons += "Response is not valid JSON"
                Write-Host "  FAIL" -ForegroundColor Red
                foreach ($r in $failureReasons) { Write-Host "    - $r" -ForegroundColor Red }
                $script:Failed++
                $script:Errors += "${testId}: $($failureReasons[0])"
                return
            }
        }
        else {
            Write-Host "  FAIL: Could not connect to server" -ForegroundColor Red
            $script:Failed++
            $script:Errors += "${testId}: Connection failed"
            return
        }
    }
    catch {
        # PowerShell Core uses HttpRequestException
        if ($_.Exception.Response) {
            $httpCode = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.Content.ReadAsStreamAsync().Result
            $reader = New-Object System.IO.StreamReader($stream)
            $bodyText = $reader.ReadToEnd()
            $reader.Close()
            try {
                $body = $bodyText | ConvertFrom-Json
            } catch {
                $failureReasons += "Response is not valid JSON"
                Write-Host "  FAIL" -ForegroundColor Red
                foreach ($r in $failureReasons) { Write-Host "    - $r" -ForegroundColor Red }
                $script:Failed++
                $script:Errors += "${testId}: $($failureReasons[0])"
                return
            }
        }
        else {
            Write-Host "  FAIL: Could not connect to server - $($_.Exception.Message)" -ForegroundColor Red
            $script:Failed++
            $script:Errors += "${testId}: Connection failed"
            return
        }
    }

    # Check HTTP status
    if ($httpCode -ne $expectedHttp) {
        $failureReasons += "HTTP status: expected $expectedHttp, got $httpCode"
    }

    # Check calculation_outcome
    $actualOutcome = $body.calculation_metadata.calculation_outcome
    if ($actualOutcome -ne $expectedOutcome) {
        $failureReasons += "calculation_outcome: expected '$expectedOutcome', got '$actualOutcome'"
    }

    # Check message count
    $actualMsgCount = @($body.calculation_result.messages).Count
    # Handle null messages array
    if ($null -eq $body.calculation_result.messages) { $actualMsgCount = 0 }
    if ($actualMsgCount -ne $expectedMsgCount) {
        $failureReasons += "message_count: expected $expectedMsgCount, got $actualMsgCount"
    }

    # Check messages level and code
    $expMsgs = @($expectedMessages)
    for ($i = 0; $i -lt $expMsgs.Count; $i++) {
        $expLevel = $expMsgs[$i].level
        $expCode = $expMsgs[$i].code
        $actMsgs = @($body.calculation_result.messages)
        if ($i -lt $actMsgs.Count) {
            $actLevel = $actMsgs[$i].level
            $actCode = $actMsgs[$i].code
        } else {
            $actLevel = ""
            $actCode = ""
        }
        if ($actLevel -ne $expLevel -or $actCode -ne $expCode) {
            $failureReasons += "message[$i]: expected ${expLevel}/${expCode}, got ${actLevel}/${actCode}"
        }
    }

    # Check mutations processed count
    $actualMutationsCount = @($body.calculation_result.mutations).Count
    if ($null -eq $body.calculation_result.mutations) { $actualMutationsCount = 0 }
    if ($actualMutationsCount -ne $expectedMutationsCount) {
        $failureReasons += "mutations_processed_count: expected $expectedMutationsCount, got $actualMutationsCount"
    }

    # Check end_situation metadata
    $actualMutationId = $body.calculation_result.end_situation.mutation_id
    $actualMutationIndex = $body.calculation_result.end_situation.mutation_index
    $actualActualAt = $body.calculation_result.end_situation.actual_at

    if ($null -ne $actualMutationId -and $null -ne $expectedMutationId) {
        if ($actualMutationId.ToLowerInvariant() -ne $expectedMutationId.ToLowerInvariant()) {
            $failureReasons += "end_situation.mutation_id: expected '$expectedMutationId', got '$actualMutationId'"
        }
    }
    if ([string]$actualMutationIndex -ne [string]$expectedMutationIndex) {
        $failureReasons += "end_situation.mutation_index: expected $expectedMutationIndex, got $actualMutationIndex"
    }
    if ($actualActualAt -ne $expectedActualAt) {
        $failureReasons += "end_situation.actual_at: expected '$expectedActualAt', got '$actualActualAt'"
    }

    # Deep compare end_situation.situation
    $actualSituation = $body.calculation_result.end_situation.situation
    $compareResult = Compare-DeepJson -Expected $expectedEndSituation -Actual $actualSituation -Path "end_situation.situation"
    if ($compareResult -ne "true") {
        $failureReasons += $compareResult
    }

    # Report
    if ($failureReasons.Count -gt 0) {
        Write-Host "  FAIL" -ForegroundColor Red
        foreach ($reason in $failureReasons) {
            Write-Host "    - $reason" -ForegroundColor Red
        }
        $script:Failed++
        $script:Errors += "${testId}: $($failureReasons[0])"
    }
    else {
        Write-Host "  PASS" -ForegroundColor Green
        $script:Passed++
    }
}

# --- Main ---

Write-Host ""
Write-Host "========================================" -ForegroundColor White
Write-Host " Pension Calculation Engine - Test Suite" -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
Write-Host "Target: $Endpoint" -ForegroundColor DarkGray
Write-Host ""

# Check connectivity
Write-Host "Testing connection to ${BaseUrl}..." -ForegroundColor Cyan
try {
    $null = Invoke-WebRequest -Uri $BaseUrl -Method GET -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
}
catch {
    Write-Host "Warning: Could not connect to ${BaseUrl}. Make sure your server is running." -ForegroundColor Yellow
    Write-Host "Continuing anyway in case the server only responds to valid requests..." -ForegroundColor DarkGray
}
Write-Host ""

# Core correctness tests (C01-C10)
Write-Host "--- Core Correctness Tests (scored) ---" -ForegroundColor Cyan
foreach ($num in @("01","02","03","04","05","06","07","08","09","10")) {
    $files = Get-ChildItem -Path $ScriptDir -Filter "C${num}-*.json" -File
    foreach ($f in $files) {
        Invoke-TestCase -TestFile $f.FullName
    }
}

Write-Host ""
Write-Host "--- Warning/Edge Case Tests (extra validation) ---" -ForegroundColor Cyan
foreach ($num in @("11","12","13","14")) {
    $files = Get-ChildItem -Path $ScriptDir -Filter "C${num}-*.json" -File
    foreach ($f in $files) {
        Invoke-TestCase -TestFile $f.FullName
    }
}

Write-Host ""
Write-Host "--- Bonus Tests ---" -ForegroundColor Cyan
$bonusFiles = Get-ChildItem -Path $ScriptDir -Filter "B*.json" -File
foreach ($f in $bonusFiles) {
    Invoke-TestCase -TestFile $f.FullName
}

# Summary
$Total = $script:Passed + $script:Failed
Write-Host ""
Write-Host "========================================" -ForegroundColor White
Write-Host -NoNewline " Results: "
Write-Host -NoNewline "$($script:Passed) passed" -ForegroundColor Green
Write-Host -NoNewline ", "
Write-Host -NoNewline "$($script:Failed) failed" -ForegroundColor Red
Write-Host " ($Total total)" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor White

if ($script:Errors.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed tests:" -ForegroundColor Yellow
    foreach ($err in $script:Errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
}

Write-Host ""
if ($script:Failed -eq 0 -and $Total -gt 0) {
    Write-Host "All tests passed!" -ForegroundColor Green
    exit 0
}
else {
    exit 1
}

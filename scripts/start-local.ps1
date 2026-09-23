$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

# Explorer does not inherit Codex's PATH. Find a usable Node installation directly.
$candidates = @()
if ($env:TEACHERFLOW_NODE) { $candidates += $env:TEACHERFLOW_NODE }
$candidates += @(Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe' }
if ($env:USERPROFILE) {
    $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

try {
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $versionText = & $candidate --version 2>$null
        if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { continue }
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        # TeacherFlow also needs built-in SQLite without an experimental flag.
        if (($major -eq 22 -and $minor -ge 13) -or $major -ge 24) {
            Write-Host "TeacherFlow: using Node $versionText. Codex does not need to be open."
            & $candidate (Join-Path $PSScriptRoot 'start-local.mjs') @args
            exit $LASTEXITCODE
        }
    }
    throw 'No supported Node.js installation was found. Install Node.js 24 (or Node.js 22.13+), then double-click Start TeacherFlow.cmd again.'
} catch {
    Write-Host "TeacherFlow could not start: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

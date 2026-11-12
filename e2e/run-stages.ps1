# All test stages, in order. Stops at the first stage that fails. Keeps the computer awake while it runs.
# -From 'load' reruns from that stage on (only when nothing changed since the earlier stages passed).
param([string]$From = '')
$ErrorActionPreference = 'Continue'
$script:started = -not $From
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
[Win32.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED, for this process only

$e2e = $PSScriptRoot
$front = Join-Path (Split-Path $PSScriptRoot -Parent) 'frontend'
$back = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend'
$keep = 'checks passed|FAIL|Tests  |Test Files|failed|FAIL|vulnerabilit|Bundle|FCP|load test|Load test|threshold|STEP|steps|Error|rror:'

function Stage($name, $dir, $cmd) {
  if ($name -eq $From) { $script:started = $true }
  if (-not $script:started) { Write-Output "--- $name skipped (passed earlier, unchanged)"; return }
  Write-Output "=== $name  $(Get-Date -Format HH:mm:ss)"
  Set-Location $dir
  $log = Join-Path $e2e ("stage-" + ($name -replace '[^a-z0-9]+', '-') + ".log")
  cmd /c "$cmd > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  Select-String -Path $log -Pattern $keep | Select-Object -Last 25 | ForEach-Object { $_.Line }
  Write-Output "$name EXIT=$code"
  if ($code -ne 0) { Write-Output 'STOPPED'; exit 1 }
}

Stage 'frontend qa' $front 'npm run qa'
Stage 'backend qa' $back 'npm run qa'
Stage 'perf' $e2e 'node perf.mjs'
Stage 'load' $back 'npm run test:load'
Stage 'security backend' $back 'npx vitest run tests/security tests/integration/clientErrors.test.js tests/integration/seo.test.js tests/unit/seoHtml.test.js'
Stage 'security frontend' $front 'npx vitest run tests/integration/articleSecurity.test.tsx tests/integration/adminSecurity.test.tsx'
Stage 'seo live' $e2e 'node seo-live.mjs'
Stage 'regression' $e2e 'node flow.mjs'
Write-Output 'ALL STAGES DONE'

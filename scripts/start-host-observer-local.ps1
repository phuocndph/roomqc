# Local Windows supervisor only. Production uses the dedicated Linux service.
# Keeps existing SSH identity/host-key checks and the observer-only DB login.
$ErrorActionPreference = 'Stop'
$observerRoot = Split-Path -Parent $PSScriptRoot
$observerControl = Join-Path $observerRoot '.local/control'
$observerTargets = Join-Path $observerControl 'host-monitor-targets.local.json'
$observerStatus = Join-Path $observerControl 'host-observer-status.local.json'
$observerNode = (Get-Command node -ErrorAction Stop).Source
$observerMutex = New-Object System.Threading.Mutex($false, 'Local\RoomQC.HostObserver.Local')
$observerOwned = $false
try {
    try { $observerOwned = $observerMutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $observerOwned = $true }
    if (-not $observerOwned) { exit 0 }
    if (-not (Test-Path -LiteralPath $observerTargets -PathType Leaf)) { throw 'Missing approved local observer targets.' }
    Set-Location -LiteralPath $observerRoot
    $env:ROOMQC_HOST_OBSERVER_ALLOW_LOCAL = 'true'
    $env:NODE_ENV = 'development'
    while ($true) {
        & $observerNode (Join-Path $PSScriptRoot 'roomqc-host-observer.mjs') --targets-file $observerTargets --local-directory --watch --interval-seconds 60 --status-file $observerStatus
        # Docker may still be starting after login. Retry without modifying it.
        Start-Sleep -Seconds 30
    }
}
finally {
    if ($observerOwned) { $observerMutex.ReleaseMutex() }
    $observerMutex.Dispose()
}

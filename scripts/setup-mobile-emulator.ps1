# Official Android emulator and isolated RoomQC AVD. No Android Studio required.
$ErrorActionPreference = 'Stop'
$buildRoot = Join-Path $env:LOCALAPPDATA 'RoomQCBuild'
$sdkRoot = Join-Path $buildRoot 'android-sdk'
$toolsRoot = Join-Path $sdkRoot 'cmdline-tools/latest'
$androidCli = Join-Path $toolsRoot 'bin/android.exe'
$java = Join-Path $buildRoot 'jdk/bin/java.exe'
if (!(Test-Path $androidCli) -or !(Test-Path $java)) {
    throw 'Run scripts/setup-mobile-toolchain.ps1 first.'
}
foreach ($package in @('emulator', 'system-images/android-36/google_apis/x86_64')) {
    $required = if ($package -eq 'emulator') { 'emulator/emulator.exe' } else { 'system-images/android-36/google_apis/x86_64/system.img' }
    if (!(Test-Path (Join-Path $sdkRoot $required))) {
        & $androidCli "--sdk=$sdkRoot" sdk install $package
        if ($LASTEXITCODE -ne 0) { throw "Cannot install $package" }
    }
}
& (Join-Path $sdkRoot 'emulator/emulator.exe') -accel-check
if ($LASTEXITCODE -ne 0) { throw 'Hardware acceleration is unavailable. See emulator output; Windows features were not changed.' }
$avdName = 'RoomQC_API_36'
$env:ANDROID_HOME = $sdkRoot
$avdArguments = @("-Dcom.android.sdkmanager.toolsdir=$toolsRoot", '-classpath', (Join-Path $toolsRoot 'lib/avdmanager-classpath.jar'), 'com.android.sdklib.tool.AvdManagerCli')
$existing = & $java @avdArguments list avd -c
if ($LASTEXITCODE -ne 0) { throw 'Cannot list Android virtual devices.' }
if ($existing -notcontains $avdName) {
    # Call Java directly: Windows batch wrappers can split semicolon package IDs.
    'no' | & $java @avdArguments create avd -n $avdName -k 'system-images;android-36;google_apis;x86_64' -d pixel_6
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create RoomQC virtual device.' }
}
# Pixel profiles default to a touch-only device. Enable host keyboard input.
$avdHome = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } elseif ($env:ANDROID_USER_HOME) { Join-Path $env:ANDROID_USER_HOME 'avd' } else { Join-Path $env:USERPROFILE '.android/avd' }
$avdPointer = Join-Path $avdHome "$avdName.ini"
$avdPath = [regex]::Match([IO.File]::ReadAllText($avdPointer), '(?m)^path=(.+)$').Groups[1].Value.Trim()
if (!$avdPath) { throw 'Cannot resolve the RoomQC AVD configuration path.' }
$avdConfig = Join-Path $avdPath 'config.ini'
$configText = [IO.File]::ReadAllText($avdConfig)
if ($configText -match '(?m)^hw\.keyboard=') {
    $configText = [regex]::Replace($configText, '(?m)^hw\.keyboard=[^\r\n]*', 'hw.keyboard=yes')
} else { $configText += "`r`nhw.keyboard=yes`r`n" }
[IO.File]::WriteAllText($avdConfig, $configText, [Text.UTF8Encoding]::new($false))
Write-Output 'RoomQC emulator is ready. Run npm run mobile:emulator to install and open the app.'

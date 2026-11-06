# Installs a portable Android build toolchain under LocalAppData/RoomQCBuild.
# No administrator privileges, PATH persistence, system Java or Android Studio needed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$buildRoot = Join-Path $env:LOCALAPPDATA 'RoomQCBuild'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$jdkRoot = Join-Path $buildRoot 'jdk'
if (!(Test-Path (Join-Path $jdkRoot 'bin/java.exe'))) {
    $downloadPage = (Invoke-WebRequest 'https://learn.microsoft.com/en-us/java/openjdk/download' -TimeoutSec 30).Content
    $downloadUrl = [regex]::Match($downloadPage, 'https://aka.ms/download-jdk/microsoft-jdk-21\.[0-9.]+-windows-x64\.zip(?=")').Value
    if (!$downloadUrl) { throw 'Official Microsoft JDK 21 link not found.' }
    $checksumText = (Invoke-WebRequest "$downloadUrl.sha256sum.txt" -TimeoutSec 30).Content
    if ($checksumText -is [byte[]]) { $checksumText = [System.Text.Encoding]::UTF8.GetString($checksumText) }
    $checksum = [regex]::Match($checksumText, '(?i)\b[0-9a-f]{64}\b').Value
    if (!$checksum) { throw 'Official JDK checksum not found.' }
    $archive = Join-Path $buildRoot 'microsoft-jdk21.zip'
    if (!(Test-Path $archive) -or (Get-FileHash $archive -Algorithm SHA256).Hash -ne $checksum) {
        Write-Output 'Downloading portable Microsoft JDK 21...'
        & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 240 --output $archive $downloadUrl
        if ($LASTEXITCODE -ne 0) { throw 'JDK download failed.' }
    }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $checksum) { throw 'JDK checksum mismatch.' }
    $unpack = Join-Path $buildRoot 'microsoft-jdk-unpack'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpack -Force
    $folder = @(Get-ChildItem -LiteralPath $unpack -Directory)[0]
    if (!$folder.FullName.StartsWith("$buildRoot\") -or !$jdkRoot.StartsWith("$buildRoot\")) { throw 'Unexpected JDK move path.' }
    Move-Item -LiteralPath $folder.FullName -Destination $jdkRoot
}
$env:JAVA_HOME = $jdkRoot
$env:Path = "$jdkRoot\bin;$env:Path"
$sdkRoot = Join-Path $buildRoot 'android-sdk'
$manager = Join-Path $sdkRoot 'cmdline-tools/latest/bin/sdkmanager.bat'
if (!(Test-Path $manager)) {
    [xml]$repository = (Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-1.xml' -TimeoutSec 30).Content
    $package = @($repository.'sdk-repository'.remotePackage | Where-Object { $_.path -eq 'cmdline-tools;latest' })[0]
    $archiveInfo = @($package.archives.archive | Where-Object { $_.'host-os' -eq 'windows' })[0].complete
    if ($archiveInfo.url -notmatch '^commandlinetools-win-[0-9]+_latest\.zip$') { throw 'Unexpected Android tools archive.' }
    $archive = Join-Path $buildRoot 'android-tools.zip'
    $checksum = [string]$archiveInfo.checksum
    if ($archiveInfo.checksum -is [System.Xml.XmlElement]) { $checksum = $archiveInfo.checksum.InnerText }
    $algorithm = if ($checksum.Length -eq 64) { 'SHA256' } elseif ($checksum.Length -eq 40) { 'SHA1' } else { throw 'Unknown official Android checksum format.' }
    if (!(Test-Path $archive) -or (Get-FileHash $archive -Algorithm $algorithm).Hash -ne $checksum) {
        Write-Output 'Downloading Android command line tools...'
        & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 240 --output $archive "https://dl.google.com/android/repository/$($archiveInfo.url)"
        if ($LASTEXITCODE -ne 0) { throw 'Android tools download failed.' }
    }
    if ((Get-FileHash $archive -Algorithm $algorithm).Hash -ne $checksum) { throw 'Android tools checksum mismatch.' }
    $unpack = Join-Path $buildRoot 'android-tools-unpack'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpack -Force
    New-Item -ItemType Directory -Path (Join-Path $sdkRoot 'cmdline-tools') -Force | Out-Null
    $source = [System.IO.Path]::GetFullPath((Join-Path $unpack 'cmdline-tools'))
    $destination = [System.IO.Path]::GetFullPath((Join-Path $sdkRoot 'cmdline-tools/latest'))
    if (!$source.StartsWith("$buildRoot\") -or !$destination.StartsWith("$buildRoot\")) { throw 'Unexpected Android tools move path.' }
    Move-Item -LiteralPath $source -Destination $destination
}
$androidCli = Join-Path $sdkRoot 'cmdline-tools/latest/bin/android.exe'
if (Test-Path $androidCli) {
    # New Android CLI uses '/' package paths. The sdkmanager compatibility
    # wrapper splits semicolons on Windows and can return success on partial installs.
    foreach ($package in @('platform-tools', 'platforms/android-36', 'build-tools/36.0.0')) {
        & $androidCli "--sdk=$sdkRoot" sdk install $package
        if ($LASTEXITCODE -ne 0) { throw "Android SDK installation failed: $package" }
    }
} else {
    1..100 | ForEach-Object { 'y' } | & $manager "--sdk_root=$sdkRoot" --licenses
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK licenses were not accepted.' }
    & $manager "--sdk_root=$sdkRoot" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed.' }
}
foreach ($required in @('platforms/android-36/android.jar', 'build-tools/36.0.0/aapt2.exe', 'platform-tools/adb.exe')) {
    if (!(Test-Path (Join-Path $sdkRoot $required))) { throw "Incomplete Android SDK: $required" }
}
Write-Output "RoomQC toolchain ready at $buildRoot"
$gradleRoot = Join-Path $buildRoot 'gradle-8.14.3'
if (!(Test-Path (Join-Path $gradleRoot 'bin/gradle.bat'))) {
    $archive = Join-Path $buildRoot 'gradle-8.14.3-bin.zip'
    $checksum = 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531'
    if (!(Test-Path $archive) -or (Get-FileHash $archive -Algorithm SHA256).Hash -ne $checksum) {
        Write-Output 'Downloading Gradle 8.14.3...'
        & curl.exe --fail --location --silent --show-error --continue-at - --connect-timeout 20 --max-time 900 --output $archive 'https://downloads.gradle.org/distributions/gradle-8.14.3-bin.zip'
        if ($LASTEXITCODE -ne 0) { throw 'Gradle download failed.' }
    }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $checksum) { throw 'Gradle checksum mismatch.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $buildRoot -Force
}
Write-Output 'Portable Gradle ready.'

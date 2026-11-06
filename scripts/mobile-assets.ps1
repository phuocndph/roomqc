# Derive platform icons and launch screens from the existing RoomQC brand asset.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = [System.Drawing.Image]::FromFile((Join-Path $project 'public/icon-512x512.png'))
function Write-Icon([string]$relativePath, [int]$size, [double]$scale = 1) {
    $path = Join-Path $project $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $drawSize = [int]($size * $scale)
        $offset = [int](($size - $drawSize) / 2)
        $graphics.DrawImage($source, $offset, $offset, $drawSize, $drawSize)
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Write-Splash([string]$path) {
    $previous = [System.Drawing.Image]::FromFile($path)
    $width = $previous.Width; $height = $previous.Height
    $previous.Dispose()
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $size = [int]([Math]::Min($width, $height) * 0.23)
        $graphics.DrawImage($source, [int](($width - $size) / 2), [int](($height - $size) / 2), $size, $size)
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    foreach ($density in @(@('mdpi',48),@('hdpi',72),@('xhdpi',96),@('xxhdpi',144),@('xxxhdpi',192))) {
        $name = $density[0]; $size = [int]$density[1]
        Write-Icon "android/app/src/main/res/mipmap-$name/ic_launcher.png" $size 0.85
        Write-Icon "android/app/src/main/res/mipmap-$name/ic_launcher_round.png" $size 0.65
        # Adaptive icon foreground stays inside Android's safe zone.
        Write-Icon "android/app/src/main/res/mipmap-$name/ic_launcher_foreground.png" ([int]($size * 2.25)) 0.6
    }
    Write-Icon 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' 1024 0.85
    Get-ChildItem -LiteralPath (Join-Path $project 'android/app/src/main/res') -Recurse -File -Filter 'splash.png' | ForEach-Object { Write-Splash $_.FullName }
    Get-ChildItem -LiteralPath (Join-Path $project 'ios/App/App/Assets.xcassets/Splash.imageset') -File -Filter '*.png' | ForEach-Object { Write-Splash $_.FullName }
} finally { $source.Dispose() }
Write-Output 'RoomQC Android/iOS icons and launch screens generated from the existing logo.'

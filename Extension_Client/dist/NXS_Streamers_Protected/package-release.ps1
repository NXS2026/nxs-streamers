$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

$sourceDir = Join-Path $PSScriptRoot 'dist\NXS_Streamers_Protected'

if (-not (Test-Path $sourceDir)) {
  throw "Protected build folder was not found: $sourceDir"
}

$manifestPath = Join-Path $sourceDir 'manifest.json'
if (-not (Test-Path $manifestPath)) {
  throw "Manifest was not found in protected build: $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "Could not read version from $manifestPath"
}

$releaseDir = Join-Path $PSScriptRoot 'release'
if (-not (Test-Path $releaseDir)) {
  New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

$zipPath = Join-Path $releaseDir ("NXS_Streamers_v{0}.zip" -f $version)

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$stageDir = Join-Path $env:TEMP ("nxs-package-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stageDir | Out-Null

try {
  $packageItems = @(
    'manifest.json',
    'popup.html',
    'popup.js',
    'background.js',
    'config.js',
    'features.js',
    'kick_automation.js',
    'stream_uptime.js',
    'utils.js',
    'modern-theme.css',
    'BUILD_INFO.json',
    'icons'
  )

  foreach ($item in $packageItems) {
    $sourcePath = Join-Path $sourceDir $item
    if (-not (Test-Path $sourcePath)) {
      throw "Required package item not found: $sourcePath"
    }

    Copy-Item -LiteralPath $sourcePath -Destination $stageDir -Recurse -Force
  }

  Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
} finally {
  if (Test-Path $stageDir) {
    Remove-Item $stageDir -Recurse -Force
  }
}

Write-Host "Release package created:"
Write-Host $zipPath

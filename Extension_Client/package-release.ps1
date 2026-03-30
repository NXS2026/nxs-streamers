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

Compress-Archive -Path (Join-Path $sourceDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Release package created:"
Write-Host $zipPath

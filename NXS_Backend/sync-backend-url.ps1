param(
  [Parameter(Mandatory = $true)]
  [string]$BackendUrl
)

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  throw ".env was not found in $PSScriptRoot"
}

function Get-EnvValue {
  param(
    [string]$Key
  )

  $line = Get-Content ".env" | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $line) {
    return ""
  }

  return ($line -replace "^$Key=", "").Trim()
}

$supabaseUrl = Get-EnvValue -Key "SUPABASE_URL"
$supabaseAnonKey = Get-EnvValue -Key "SUPABASE_ANON_KEY"

if (-not $supabaseUrl) {
  throw "SUPABASE_URL is missing in .env"
}

if (-not $supabaseAnonKey) {
  throw "SUPABASE_ANON_KEY is missing in .env"
}

$cleanUrl = $BackendUrl.Trim().TrimEnd('/')
$requestUrl = "$($supabaseUrl.TrimEnd('/'))/rest/v1/backend_config?id=eq.1"
$headers = @{
  "apikey"        = $supabaseAnonKey
  "Authorization" = "Bearer $supabaseAnonKey"
  "Content-Type"  = "application/json"
  "Prefer"        = "return=representation"
}

$body = @{
  current_url = $cleanUrl
} | ConvertTo-Json

$response = Invoke-RestMethod -Method Patch -Uri $requestUrl -Headers $headers -Body $body

Write-Host "Supabase backend_config.current_url updated to: $cleanUrl"
$response | ConvertTo-Json -Depth 6

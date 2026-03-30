$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

if (-not (Test-Path "node_modules")) {
  npm install
}

$port = 3000
try {
  $envLines = Get-Content ".env" -ErrorAction Stop
  foreach ($line in $envLines) {
    if ($line -match '^PORT=(\d+)$') {
      $port = [int]$Matches[1]
      break
    }
  }
} catch {
}

function Test-BackendHealth {
  param([int]$BackendPort)
  try {
    $response = Invoke-RestMethod -Uri "http://localhost:$BackendPort/api/health" -Method Get -TimeoutSec 3
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

if (-not (Test-BackendHealth -BackendPort $port)) {
  $backendCommand = @"
Set-Location '$PSScriptRoot'
\$env:OTP_DEBUG='false'
npm run start
"@

  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', $backendCommand
  ) -WorkingDirectory $PSScriptRoot | Out-Null

  Write-Host "Started backend in a new PowerShell window with OTP_DEBUG=false"

  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-BackendHealth -BackendPort $port) {
      break
    }
    Start-Sleep -Seconds 1
  }
}

if (-not (Test-BackendHealth -BackendPort $port)) {
  throw "Backend did not become healthy on http://localhost:$port/api/health"
}

Write-Host "Backend is healthy on http://localhost:$port"
Write-Host "Opening public tunnel and syncing Supabase..."

npm run tunnel

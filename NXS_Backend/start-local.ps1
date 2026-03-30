$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run start

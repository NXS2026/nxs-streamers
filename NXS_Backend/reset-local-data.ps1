$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

$dbPath = Join-Path $PSScriptRoot 'data\db.json'
$defaultJson = @'
{
  "users": [],
  "otpRequests": [],
  "urlWhitelist": [],
  "schedule": {
    "enabled": false,
    "rules": []
  },
  "dashboard": {},
  "logs": [],
  "actionLogs": [],
  "activeUsers": {},
  "moderation": {
    "bans": {},
    "timeouts": {},
    "kicks": {}
  },
  "announcements": {
    "latest": null,
    "confirmations": []
  },
  "whitelistErrors": []
}
'@

[System.IO.File]::WriteAllText(
  $dbPath,
  $defaultJson,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Reset local backend data: $dbPath"

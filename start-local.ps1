$ErrorActionPreference = "Stop"
Write-Host "Logix Retail Intelligence - local startup" -ForegroundColor Cyan

if (-not (Test-Path "backend/.env")) {
  $envText = Get-Content "backend/.env.example" -Raw

  $secretBytes = New-Object byte[] 48
  $dbBytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($secretBytes)
  $rng.GetBytes($dbBytes)
  $secret = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $dbPassword = -join ($dbBytes | ForEach-Object { $_.ToString('x2') })

  $adminEmail = Read-Host "Administrator email"
  if ([string]::IsNullOrWhiteSpace($adminEmail)) { throw "Administrator email is required." }
  $securePassword = Read-Host "Create administrator password (minimum 12 characters)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try { $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($adminPassword.Length -lt 12) { throw "Administrator password must be at least 12 characters. Rerun the script." }

  $envText = [regex]::Replace($envText, '(?m)^SECRET_KEY=.*$', "SECRET_KEY=$secret")
  $envText = [regex]::Replace($envText, '(?m)^DATABASE_URL=.*$', "DATABASE_URL=postgresql+psycopg://logix:$dbPassword@db:5432/logix_retail")
  $envText = [regex]::Replace($envText, '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$dbPassword")
  $envText = [regex]::Replace($envText, '(?m)^BOOTSTRAP_ADMIN_EMAIL=.*$', "BOOTSTRAP_ADMIN_EMAIL=$adminEmail")
  $envText = [regex]::Replace($envText, '(?m)^BOOTSTRAP_ADMIN_PASSWORD=.*$', "BOOTSTRAP_ADMIN_PASSWORD=$adminPassword")
  Set-Content -Path "backend/.env" -Value $envText -Encoding UTF8
  $adminPassword = $null
  Write-Host "Private backend configuration created. Do not upload or share backend/.env." -ForegroundColor Green
}

$privateEnv = Get-Content "backend/.env" -Raw
if ($privateEnv -match 'replace-with-|change-this') {
  throw "backend/.env still contains placeholder values. Replace SECRET_KEY, POSTGRES_PASSWORD, DATABASE_URL and BOOTSTRAP_ADMIN_PASSWORD before continuing."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is required. Install/start Docker Desktop, then rerun this script."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is not running. Start it and rerun this script." }

if (-not (Test-Path "node_modules")) {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed. Check the output above." }

Write-Host ""
Write-Host "Backend health: http://localhost:8000/health"
Write-Host "API documentation: http://localhost:8000/docs"
Write-Host "Starting frontend at http://localhost:3000 ..."
npm run dev

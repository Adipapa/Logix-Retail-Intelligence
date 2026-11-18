$ErrorActionPreference = "Stop"
Write-Host "Logix Retail Intelligence - local startup" -ForegroundColor Cyan

if (-not (Test-Path "backend/.env")) {
  Copy-Item "backend/.env.example" "backend/.env"
  Write-Host "Created backend/.env from the example." -ForegroundColor Yellow
  Write-Host "Edit backend/.env now: set SECRET_KEY, BOOTSTRAP_ADMIN_EMAIL and a strong BOOTSTRAP_ADMIN_PASSWORD. Keep the database password consistent with DATABASE_URL."
  exit 1
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

# ArbiMind UI Dev Server (Windows-optimized)
# Run: .\dev.ps1

Write-Host "🧹 Cleaning caches..." -ForegroundColor Cyan
Remove-Item -Recurse -Force .\.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\node_modules\.cache -ErrorAction SilentlyContinue

Write-Host "🚀 Starting dev server (Turbopack disabled)..." -ForegroundColor Green
$env:NEXT_DISABLE_TURBOPACK = "1"
$env:NEXT_TELEMETRY_DISABLED = "1"

pnpm dev

# ArbiMind Credential Rotation Helper
# Run this to generate new testnet credentials

Write-Host "`n[SECURITY] ArbiMind Testnet Credential Generator`n" -ForegroundColor Cyan

# 1. Generate new testnet private key
Write-Host "1. NEW TESTNET PRIVATE KEY:" -ForegroundColor Yellow
$newKey = "0x" + -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
Write-Host "   $newKey" -ForegroundColor Green
Write-Host "   WARNING: TESTNET ONLY - Never use in production!`n" -ForegroundColor Red

# 2. Generate admin API keys
Write-Host "2. NEW ADMIN_API_KEY:" -ForegroundColor Yellow
$adminKey = -join ((1..32) | ForEach-Object { 
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $chars[(Get-Random -Maximum $chars.Length)]
})
Write-Host "   $adminKey`n" -ForegroundColor Green

# 3. Generate AI service key
Write-Host "3. NEW AI_SERVICE_KEY:" -ForegroundColor Yellow
$aiKey = -join ((1..32) | ForEach-Object { 
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $chars[(Get-Random -Maximum $chars.Length)]
})
Write-Host "   $aiKey`n" -ForegroundColor Green

# 4. Manual steps reminder
Write-Host "4. TELEGRAM BOT TOKEN (manual):" -ForegroundColor Yellow
Write-Host "   > Open Telegram > @BotFather" -ForegroundColor Cyan
Write-Host "   > /mybots > Select bot > API Token > Regenerate" -ForegroundColor Cyan
Write-Host "   > Copy new token`n"

Write-Host "5. DISCORD WEBHOOK (manual):" -ForegroundColor Yellow
Write-Host "   > Discord Server Settings > Integrations > Webhooks" -ForegroundColor Cyan
Write-Host "   > Delete old webhook > Create New" -ForegroundColor Cyan
Write-Host "   > Copy webhook URL`n"

# Save to temporary env file (do not commit)
$envContent = @"
# Generated $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# WARNING TESTNET ONLY - DO NOT COMMIT THIS FILE

# Wallet (testnet)
PRIVATE_KEY=$newKey
TREASURY_ADDRESS=<YOUR-METAMASK-TESTNET-ADDRESS>
ARB_EXECUTOR_ADDRESS=<YOUR-DEPLOYED-CONTRACT-ADDRESS>

# Admin keys
ADMIN_API_KEY=$adminKey
AI_SERVICE_KEY=$aiKey

# Alerts (generate manually)
ALERT_TELEGRAM_TOKEN=<GET-FROM-BOTFATHER>
ALERT_TELEGRAM_CHAT_ID=<YOUR-TELEGRAM-CHAT-ID>
ALERT_DISCORD_WEBHOOK=<GET-FROM-DISCORD>

# Chain config
NETWORK=testnet
EVM_CHAIN=polygon
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
"@

$envContent | Out-File -FilePath "testnet-credentials-NEW.env" -Encoding utf8
Write-Host "[OK] Saved to: testnet-credentials-NEW.env" -ForegroundColor Green
Write-Host "     Review, update manual fields, then copy to Railway env vars`n" -ForegroundColor Yellow

Write-Host "[NEXT STEPS]" -ForegroundColor Cyan
Write-Host "   1. Fill in Telegram/Discord values in testnet-credentials-NEW.env"
Write-Host "   2. Use these values in Railway env vars (see TESTNET_DEPLOY_GUIDE.md)"
Write-Host "   3. Delete testnet-credentials-NEW.env after copying (do not commit)`n"

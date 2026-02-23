<#
.SYNOPSIS
  Deploy and configure ArbExecutor on Ethereum Sepolia, then update Railway bot vars.

.DESCRIPTION
  - Validates Foundry + Railway CLI availability
  - Deploys ArbExecutor with constructor args
  - Configures Uniswap V2/V3 routers and token allowlist
  - Verifies bytecode exists on Sepolia
  - Optionally flips Railway bot from LOG_ONLY to live testnet execution
  - Supports dry-run mode via -WhatIf (prints actions, makes no changes)

.EXAMPLE
  .\scripts\deploy-sepolia-executor.ps1 `
    -SepoliaRpcUrl "https://sepolia.infura.io/v3/<KEY>" `
    -PrivateKey "<PRIVATE_KEY>" `
    -ExecutorAddress "0xYourBotWallet" `
    -TreasuryAddress "0xYourTreasury" `
    -RailwayService "arbimind"

.EXAMPLE
  .\scripts\deploy-sepolia-executor.ps1 ... -EnableLiveExecution

.EXAMPLE
  .\scripts\deploy-sepolia-executor.ps1 ... -WhatIf
#>
param(
  [Parameter(Mandatory = $true)][string]$SepoliaRpcUrl,
  [Parameter(Mandatory = $true)][string]$PrivateKey,
  [Parameter(Mandatory = $true)][string]$ExecutorAddress,
  [Parameter(Mandatory = $true)][string]$TreasuryAddress,

  [string]$RailwayService = 'arbimind',
  [string]$MinProfitWei = '10000000000000000', # 0.01 ETH

  [string]$WethAddress = '0x7b79995e5f793a07bc00c21412e50ecae098e7f9',
  [string]$UsdcAddress = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',

  [string]$UniswapV2Router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  [string]$UniswapV2Factory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  [string]$UniswapV3Router = '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  [string]$UniswapV3Factory = '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  [string]$UniswapV3Quoter = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',

  [switch]$EnableLiveExecution,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' not found in PATH."
  }
}

function Assert-EvmAddress([string]$Value, [string]$Label) {
  if ($Value -notmatch '^0x[a-fA-F0-9]{40}$') {
    throw "$Label is not a valid EVM address: $Value"
  }
}

function Assert-PrivateKey([string]$Value) {
  if ($Value -notmatch '^0x[a-fA-F0-9]{64}$') {
    throw 'PrivateKey must be 0x-prefixed 64-hex string.'
  }
}

Write-Host 'Validating prerequisites...' -ForegroundColor Cyan
Assert-Command forge
Assert-Command cast
Assert-Command railway
Assert-EvmAddress -Value $ExecutorAddress -Label 'ExecutorAddress'
Assert-EvmAddress -Value $TreasuryAddress -Label 'TreasuryAddress'
Assert-EvmAddress -Value $WethAddress -Label 'WethAddress'
Assert-EvmAddress -Value $UsdcAddress -Label 'UsdcAddress'
Assert-EvmAddress -Value $UniswapV2Router -Label 'UniswapV2Router'
Assert-EvmAddress -Value $UniswapV3Router -Label 'UniswapV3Router'
Assert-PrivateKey -Value $PrivateKey

if ($WhatIf) {
  Write-Host 'WHATIF mode enabled: no broadcast, no cast sends, no Railway variable changes, no redeploy.' -ForegroundColor Yellow
}

$contractsDir = Join-Path $PSScriptRoot '..\packages\contracts'
if (-not (Test-Path $contractsDir)) {
  throw "Contracts directory not found: $contractsDir"
}

Push-Location $contractsDir
try {
  Write-Host 'Building contracts...' -ForegroundColor Cyan
  if ($WhatIf) {
    Write-Host '[WHATIF] forge build'
  }
  else {
    forge build | Out-Host
  }

  Write-Host 'Deploying ArbExecutor to Ethereum Sepolia...' -ForegroundColor Cyan
  $deployedAddress = $null
  if ($WhatIf) {
    Write-Host "[WHATIF] forge create src/ArbExecutor.sol:ArbExecutor --rpc-url <redacted> --private-key <redacted> --broadcast --constructor-args $ExecutorAddress $TreasuryAddress $MinProfitWei"
    $deployedAddress = '<DEPLOYED_ADDRESS>'
  }
  else {
    $deployOutput = forge create src/ArbExecutor.sol:ArbExecutor `
      --rpc-url $SepoliaRpcUrl `
      --private-key $PrivateKey `
      --broadcast `
      --constructor-args $ExecutorAddress $TreasuryAddress $MinProfitWei 2>&1

    $deployOutput | Out-Host

    foreach ($line in $deployOutput) {
      if ($line -match 'Deployed to:\s*(0x[a-fA-F0-9]{40})') {
        $deployedAddress = $Matches[1]
        break
      }
    }

    if (-not $deployedAddress) {
      throw 'Could not parse deployed contract address from forge output.'
    }
  }

  Write-Host "ArbExecutor deployed at: $deployedAddress" -ForegroundColor Green

  Write-Host 'Configuring routers + allowlisted tokens...' -ForegroundColor Cyan
  if ($WhatIf) {
    Write-Host "[WHATIF] cast send $deployedAddress setDexRouter(UNISWAP_V2,$UniswapV2Router)"
    Write-Host "[WHATIF] cast send $deployedAddress setDexRouter(UNISWAP_V3,$UniswapV3Router)"
    Write-Host "[WHATIF] cast send $deployedAddress setAllowedToken($WethAddress,true)"
    Write-Host "[WHATIF] cast send $deployedAddress setAllowedToken($UsdcAddress,true)"
  }
  else {
    cast send $deployedAddress "setDexRouter(string,address)" "UNISWAP_V2" $UniswapV2Router --rpc-url $SepoliaRpcUrl --private-key $PrivateKey | Out-Host
    cast send $deployedAddress "setDexRouter(string,address)" "UNISWAP_V3" $UniswapV3Router --rpc-url $SepoliaRpcUrl --private-key $PrivateKey | Out-Host

    cast send $deployedAddress "setAllowedToken(address,bool)" $WethAddress true --rpc-url $SepoliaRpcUrl --private-key $PrivateKey | Out-Host
    cast send $deployedAddress "setAllowedToken(address,bool)" $UsdcAddress true --rpc-url $SepoliaRpcUrl --private-key $PrivateKey | Out-Host
  }

  Write-Host 'Verifying deployed bytecode exists...' -ForegroundColor Cyan
  if ($WhatIf) {
    Write-Host "[WHATIF] cast code $deployedAddress --rpc-url <redacted>"
  }
  else {
    $code = cast code $deployedAddress --rpc-url $SepoliaRpcUrl
    if ([string]::IsNullOrWhiteSpace($code) -or $code.Trim() -eq '0x') {
      throw "No bytecode found at deployed address: $deployedAddress"
    }
    Write-Host 'Bytecode verification passed.' -ForegroundColor Green
  }

  Write-Host 'Updating Railway service variables...' -ForegroundColor Cyan
  if ($WhatIf) {
    Write-Host "[WHATIF] railway variable set --service $RailwayService ARB_EXECUTOR_ADDRESS=$deployedAddress ETHEREUM_RPC_URL=<redacted> EVM_CHAIN=ethereum NETWORK=testnet ALLOW_TESTNET_TRADES=true LOG_LEVEL=info ..."
  }
  else {
    railway variable set --service $RailwayService `
      ARB_EXECUTOR_ADDRESS=$deployedAddress `
      ETHEREUM_RPC_URL=$SepoliaRpcUrl `
      EVM_CHAIN=ethereum `
      NETWORK=testnet `
      ALLOW_TESTNET_TRADES=true `
      LOG_LEVEL=info `
      SEPOLIA_USDC_ADDRESS=$UsdcAddress `
      SEPOLIA_UNISWAP_V2_ROUTER=$UniswapV2Router `
      SEPOLIA_UNISWAP_V2_FACTORY=$UniswapV2Factory `
      SEPOLIA_UNISWAP_V3_ROUTER=$UniswapV3Router `
      SEPOLIA_UNISWAP_V3_FACTORY=$UniswapV3Factory `
      SEPOLIA_UNISWAP_V3_QUOTER=$UniswapV3Quoter | Out-Host
  }

  if ($EnableLiveExecution) {
    Write-Host 'Enabling live testnet execution (LOG_ONLY=false)...' -ForegroundColor Yellow
    if ($WhatIf) {
      Write-Host "[WHATIF] railway variable set --service $RailwayService LOG_ONLY=false BOT_LOG_ONLY=false"
    }
    else {
      railway variable set --service $RailwayService LOG_ONLY=false BOT_LOG_ONLY=false | Out-Host
    }
  }
  else {
    Write-Host 'Keeping scan-only safety mode (LOG_ONLY=true)...' -ForegroundColor Yellow
    if ($WhatIf) {
      Write-Host "[WHATIF] railway variable set --service $RailwayService LOG_ONLY=true BOT_LOG_ONLY=true"
    }
    else {
      railway variable set --service $RailwayService LOG_ONLY=true BOT_LOG_ONLY=true | Out-Host
    }
  }

  Write-Host 'Redeploying Railway service...' -ForegroundColor Cyan
  if ($WhatIf) {
    Write-Host "[WHATIF] railway service redeploy --service $RailwayService --yes"
  }
  else {
    railway service redeploy --service $RailwayService --yes | Out-Host
  }

  Write-Host "Done. Deployed ArbExecutor: $deployedAddress" -ForegroundColor Green
  Write-Host 'Check runtime logs with:' -ForegroundColor Cyan
  Write-Host "  railway service logs --service $RailwayService --latest --lines 300"
}
finally {
  Pop-Location
}

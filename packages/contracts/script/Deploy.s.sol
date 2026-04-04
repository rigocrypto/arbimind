// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ArbExecutor} from "../src/ArbExecutor.sol";

/**
 * @title Deploy
 * @dev Deployment script for ArbiMind contracts on Arbitrum One
 *
 * Required env vars:
 *   PRIVATE_KEY          – deployer wallet (also becomes contract owner)
 *   EXECUTOR_ADDRESS     – bot wallet that will call executeArbV2V3()
 *
 * Optional env overrides:
 *   TREASURY_ADDRESS     – profit destination (default below)
 *   MIN_PROFIT_THRESHOLD – on-chain floor in wei  (default 0.0001 ether)
 */
contract Deploy is Script {
    // Arbitrum One DEX routers (must match packages/bot/src/config/dexes.ts)
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHISWAP_ROUTER  = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;

    // Arbitrum One token addresses (must match packages/bot/src/config/tokens.ts)
    address public constant WETH   = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant USDC   = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address public constant USDC_E = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;
    address public constant USDT   = 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9;
    address public constant DAI    = 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1;
    address public constant WBTC   = 0x2f2a2543b6822D9A882063FDA12032f94A611C5d;
    address public constant ARB    = 0x912CE59144191C1204E64559FE8253a0e49E6548;
    address public constant LINK   = 0xf97f4df75117a78c1A5a0DBb814Af92458539FB4;

    // Default treasury – override with TREASURY_ADDRESS env var
    address public constant DEFAULT_TREASURY = 0xb4CfAB88357D0f8C817a0b4E8C95D7B067C49Ac0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address executorAddr = vm.envAddress("EXECUTOR_ADDRESS");
        address treasury = vm.envOr("TREASURY_ADDRESS", DEFAULT_TREASURY);
        uint256 minProfit = vm.envOr("MIN_PROFIT_THRESHOLD", uint256(0.0001 ether));

        vm.startBroadcast(deployerPrivateKey);

        ArbExecutor arbExecutor = new ArbExecutor(
            executorAddr,
            treasury,
            minProfit
        );

        // Register DEX routers
        arbExecutor.setDexRouter("UNISWAP_V3", UNISWAP_V3_ROUTER);
        arbExecutor.setDexRouter("SUSHISWAP",  SUSHISWAP_ROUTER);

        // Allow traded tokens
        arbExecutor.setAllowedToken(WETH,   true);
        arbExecutor.setAllowedToken(USDC,   true);
        arbExecutor.setAllowedToken(USDC_E, true);
        arbExecutor.setAllowedToken(USDT,   true);
        arbExecutor.setAllowedToken(DAI,    true);
        arbExecutor.setAllowedToken(WBTC,   true);
        arbExecutor.setAllowedToken(ARB,    true);
        arbExecutor.setAllowedToken(LINK,   true);

        vm.stopBroadcast();

        console2.log("=== ArbiMind Arbitrum Deployment ===");
        console2.log("ArbExecutor:", address(arbExecutor));
        console2.log("Executor:   ", executorAddr);
        console2.log("Treasury:   ", treasury);
        console2.log("Min profit: ", minProfit);
        console2.log("====================================");
    }
}

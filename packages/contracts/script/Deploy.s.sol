// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ArbExecutor} from "../src/ArbExecutor.sol";

/**
 * @title Deploy
 * @dev Deployment script for ArbiMind contracts
 */
contract Deploy is Script {
    // Configuration - update these for your deployment
    address public constant EXECUTOR = 0x0000000000000000000000000000000000000000; // Update with bot address
    address public constant TREASURY = 0x0000000000000000000000000000000000000000; // Update with treasury address
    uint256 public constant MIN_PROFIT_THRESHOLD = 0.01 ether; // 0.01 ETH minimum profit

    // Mainnet DEX addresses
    address public constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHISWAP_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;

    // Mainnet token addresses
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        // Deploy ArbExecutor
        ArbExecutor arbExecutor = new ArbExecutor(
            EXECUTOR,
            TREASURY,
            MIN_PROFIT_THRESHOLD
        );

        // Configure DEX routers
        arbExecutor.setDexRouter("UNISWAP_V2", UNISWAP_V2_ROUTER);
        arbExecutor.setDexRouter("UNISWAP_V3", UNISWAP_V3_ROUTER);
        arbExecutor.setDexRouter("SUSHISWAP", SUSHISWAP_ROUTER);

        // Configure allowed tokens
        arbExecutor.setAllowedToken(WETH, true);
        arbExecutor.setAllowedToken(USDC, true);
        arbExecutor.setAllowedToken(USDT, true);
        arbExecutor.setAllowedToken(DAI, true);

        vm.stopBroadcast();

        // Log deployment information
        console.log("=== ArbiMind Deployment ===");
        console.log("ArbExecutor deployed at:", address(arbExecutor));
        console.log("Executor address:", EXECUTOR);
        console.log("Treasury address:", TREASURY);
        console.log("Min profit threshold:", MIN_PROFIT_THRESHOLD);
        console.log("==========================");
    }
}

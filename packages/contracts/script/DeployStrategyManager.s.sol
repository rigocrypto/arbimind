// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {ArbiMindStrategyManager} from "../src/ArbiMindStrategyManager.sol";
import {ArbitrageAdapterV2V3} from "../src/adapters/ArbitrageAdapterV2V3.sol";
import {TrendAdapter} from "../src/adapters/TrendAdapter.sol";
import {MarketMakerAdapter} from "../src/adapters/MarketMakerAdapter.sol";

contract DeployStrategyManager is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER");
        address executor = vm.envAddress("EXECUTOR");
        address treasury = vm.envAddress("TREASURY");
        uint256 maxDailyLossWei = vm.envUint("MAX_DAILY_LOSS_WEI");

        vm.startBroadcast(deployer);

        // Deploy TrendAdapter with oracle address (using deployer as oracle for now)
        TrendAdapter trend = new TrendAdapter(deployer);
        
        // Deploy MarketMakerAdapter with Uniswap V3 addresses
        // Mainnet addresses for Uniswap V3
        address positionManager = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88; // Uniswap V3 Position Manager
        address factory = 0x1F98431c8aD98523631AE4a59f267346ea31F984; // Uniswap V3 Factory
        MarketMakerAdapter mm = new MarketMakerAdapter(positionManager, factory);

        ArbiMindStrategyManager mgr = new ArbiMindStrategyManager(executor, treasury, maxDailyLossWei);

        // Routers (mainnet)
        address V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
        address V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
        ArbitrageAdapterV2V3 arb = new ArbitrageAdapterV2V3(address(mgr), V2_ROUTER, V3_ROUTER);

        // register strategies with ids and enable + allocate
        bytes32 ARB_ID = keccak256("ARBITRAGE");
        bytes32 TREND_ID = keccak256("TREND");
        bytes32 MM_ID = keccak256("MARKET_MAKING");

        mgr.registerStrategy(ARB_ID, address(arb));
        mgr.updateStrategy(ARB_ID, address(0), true, 4000);

        mgr.registerStrategy(TREND_ID, address(trend));
        mgr.updateStrategy(TREND_ID, address(0), true, 3000);

        mgr.registerStrategy(MM_ID, address(mm));
        mgr.updateStrategy(MM_ID, address(0), true, 3000);

        vm.stopBroadcast();
    }
}



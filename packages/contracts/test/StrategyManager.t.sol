// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ArbiMindStrategyManager} from "../src/ArbiMindStrategyManager.sol";
import {ArbitrageAdapter} from "../src/adapters/ArbitrageAdapter.sol";
import {TrendAdapter} from "../src/adapters/TrendAdapter.sol";
import {MarketMakerAdapter} from "../src/adapters/MarketMakerAdapter.sol";

contract StrategyManagerTest is Test {
    ArbiMindStrategyManager mgr;
    ArbitrageAdapter arb;
    TrendAdapter trend;
    MarketMakerAdapter mm;

    address deployer = address(0xDepl0y);
    address executor = address(0xExec01);
    address treasury = address(0xTres01);

    function setUp() public {
        vm.startPrank(deployer);
        arb = new ArbitrageAdapter(address(0), address(0));
        trend = new TrendAdapter();
        mm = new MarketMakerAdapter();
        mgr = new ArbiMindStrategyManager(executor, treasury, 1 ether); // max daily loss = 1 ETH
        vm.stopPrank();

        vm.prank(deployer);
        mgr.registerStrategy(keccak256("ARBITRAGE"), address(arb));
        vm.prank(deployer);
        mgr.updateStrategy(keccak256("ARBITRAGE"), address(0), true, 4000);

        vm.prank(deployer);
        mgr.registerStrategy(keccak256("TREND"), address(trend));
        vm.prank(deployer);
        mgr.updateStrategy(keccak256("TREND"), address(0), true, 3000);

        vm.prank(deployer);
        mgr.registerStrategy(keccak256("MM"), address(mm));
        vm.prank(deployer);
        mgr.updateStrategy(keccak256("MM"), address(0), true, 3000);
    }

    function testAllocationCap() public {
        // try to over-allocate by increasing ARB to 5000 (would total 11000)
        vm.prank(deployer);
        vm.expectRevert();
        mgr.updateStrategy(keccak256("ARBITRAGE"), address(0), true, 5000);
    }

    function testPausePreventsExecution() public {
        vm.prank(deployer);
        mgr.pause();
        vm.prank(executor);
        vm.expectRevert();
        mgr.executeStrategy(keccak256("ARBITRAGE"), bytes(""));

        vm.prank(deployer);
        mgr.unpause();
        vm.prank(executor);
        mgr.executeStrategy(keccak256("ARBITRAGE"), bytes(""));
    }

    function testDailyLossLimit() public {
        // set low daily loss: 60 wei
        vm.prank(deployer);
        mgr.setMaxDailyLossWei(60);
        // trend with empty params produces -50
        vm.prank(executor);
        mgr.executeStrategy(keccak256("TREND"), bytes(""));
        // another -50 would exceed 60 -> revert
        vm.prank(executor);
        vm.expectRevert();
        mgr.executeStrategy(keccak256("TREND"), bytes(""));
    }

    function testHappyPathExecute() public {
        vm.prank(executor);
        mgr.executeStrategy(keccak256("ARBITRAGE"), bytes(""));
    }
}



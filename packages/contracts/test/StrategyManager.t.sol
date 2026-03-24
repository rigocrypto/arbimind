// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ArbiMindStrategyManager} from "../src/ArbiMindStrategyManager.sol";

contract MockStrategyAdapter {
    int256 public pnl;
    uint256 public gasUsed;

    constructor(int256 _pnl, uint256 _gasUsed) {
        pnl = _pnl;
        gasUsed = _gasUsed;
    }

    function execute(bytes calldata) external payable returns (int256, uint256) {
        return (pnl, gasUsed);
    }
}

contract StrategyManagerTest is Test {
    ArbiMindStrategyManager mgr;
    MockStrategyAdapter arb;
    MockStrategyAdapter trend;
    MockStrategyAdapter mm;

    address deployer = address(0x1234567890123456789012345678901234567890);
    address executor = address(0x1234567890123456789012345678901234567891);
    address treasury = address(0x1234567890123456789012345678901234567892);

    function setUp() public {
        vm.startPrank(deployer);
        arb = new MockStrategyAdapter(100, 120_000);
        trend = new MockStrategyAdapter(-50, 110_000);
        mm = new MockStrategyAdapter(25, 100_000);
        mgr = new ArbiMindStrategyManager(executor, treasury, 1 ether);
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
        vm.prank(deployer);
        mgr.setMaxDailyLossWei(60);

        vm.prank(executor);
        mgr.executeStrategy(keccak256("TREND"), bytes(""));

        vm.prank(executor);
        vm.expectRevert();
        mgr.executeStrategy(keccak256("TREND"), bytes(""));
    }

    function testHappyPathExecute() public {
        vm.prank(executor);
        mgr.executeStrategy(keccak256("ARBITRAGE"), bytes(""));
    }
}
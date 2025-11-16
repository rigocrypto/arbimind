// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {TrendAdapter} from "../src/adapters/TrendAdapter.sol";
import {MarketMakerAdapter} from "../src/adapters/MarketMakerAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AdaptersTest is Test {
    TrendAdapter public trendAdapter;
    MarketMakerAdapter public marketMakerAdapter;
    
    address public oracle = address(0x123);
    address public positionManager = address(0x456);
    address public factory = address(0x789);
    address public weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public usdc = address(0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8);
    
    function setUp() public {
        trendAdapter = new TrendAdapter(oracle);
        marketMakerAdapter = new MarketMakerAdapter(positionManager, factory);
    }

    // TrendAdapter Tests
    function testTrendAdapterConstructor() public {
        assertEq(trendAdapter.oracle(), oracle);
        assertEq(trendAdapter.minConfidence(), 7000); // 70%
        assertEq(trendAdapter.maxSlippage(), 500); // 5%
        assertEq(trendAdapter.nonce(), 0);
    }

    function testTrendAdapterSetOracle() public {
        address newOracle = address(0x999);
        vm.prank(address(this));
        trendAdapter.setOracle(newOracle);
        assertEq(trendAdapter.oracle(), newOracle);
    }

    function testTrendAdapterSetMinConfidence() public {
        vm.prank(address(this));
        trendAdapter.setMinConfidence(8000); // 80%
        assertEq(trendAdapter.minConfidence(), 8000);
    }

    function testTrendAdapterSetMaxSlippage() public {
        vm.prank(address(this));
        trendAdapter.setMaxSlippage(1000); // 10%
        assertEq(trendAdapter.maxSlippage(), 1000);
    }

    function testTrendAdapterInvalidConfidence() public {
        vm.prank(address(this));
        vm.expectRevert("Invalid confidence");
        trendAdapter.setMinConfidence(11000); // > 100%
    }

    function testTrendAdapterInvalidSlippage() public {
        vm.prank(address(this));
        vm.expectRevert("Slippage too high");
        trendAdapter.setMaxSlippage(2500); // > 20%
    }

    function testTrendAdapterEmergencyWithdraw() public {
        // Mock token transfer
        vm.mockCall(
            weth,
            abi.encodeWithSelector(IERC20.balanceOf.selector),
            abi.encode(1000)
        );
        
        vm.prank(address(this));
        trendAdapter.emergencyWithdraw(weth);
    }

    // MarketMakerAdapter Tests
    function testMarketMakerAdapterConstructor() public {
        assertEq(address(marketMakerAdapter.positionManager()), positionManager);
        assertEq(address(marketMakerAdapter.factory()), factory);
        assertEq(marketMakerAdapter.totalPositions(), 0);
    }

    function testMarketMakerAdapterGetPosition() public {
        MarketMakerAdapter.PositionInfo memory position = marketMakerAdapter.getPosition(0);
        assertEq(position.token0, address(0));
        assertEq(position.token1, address(0));
        assertEq(position.active, false);
    }

    function testMarketMakerAdapterGetActivePositions() public {
        uint256[] memory activePositions = marketMakerAdapter.getActivePositions();
        assertEq(activePositions.length, 0);
    }

    function testMarketMakerAdapterEmergencyWithdrawToken() public {
        // Mock token transfer
        vm.mockCall(
            weth,
            abi.encodeWithSelector(IERC20.balanceOf.selector),
            abi.encode(1000)
        );
        
        vm.prank(address(this));
        marketMakerAdapter.emergencyWithdrawToken(weth);
    }

    function testMarketMakerAdapterEmergencyWithdrawETH() public {
        // Mock ETH balance
        vm.deal(address(marketMakerAdapter), 1 ether);
        
        vm.prank(address(this));
        marketMakerAdapter.emergencyWithdrawETH();
    }

    // Integration Tests
    function testTrendAdapterSignalValidation() public {
        TrendAdapter.TrendSignal memory signal = TrendAdapter.TrendSignal({
            tokenIn: weth,
            tokenOut: usdc,
            amountIn: 0.1 ether,
            minAmountOut: 150 * 10**6, // 150 USDC
            confidence: 8000, // 80%
            deadline: block.timestamp + 300,
            nonce: 0,
            fee: 3000 // 0.3%
        });

        // This should revert because we're not calling from strategy manager
        // and we don't have a valid signature
        vm.expectRevert();
        trendAdapter.executeTrendSignal(signal, "");
    }

    function testMarketMakerAdapterAddLiquidityValidation() public {
        MarketMakerAdapter.AddLiquidityParams memory params = MarketMakerAdapter.AddLiquidityParams({
            token0: weth,
            token1: usdc,
            fee: 3000,
            tickLower: -1000,
            tickUpper: 1000,
            amount0Desired: 0.1 ether,
            amount1Desired: 150 * 10**6,
            amount0Min: 0.09 ether,
            amount1Min: 135 * 10**6
        });

        // This should revert because we're not calling from strategy manager
        // and we don't have the required tokens
        vm.expectRevert();
        marketMakerAdapter.addLiquidity(params);
    }

    // Access Control Tests
    function testTrendAdapterOnlyOwner() public {
        vm.prank(address(0x123));
        vm.expectRevert();
        trendAdapter.setOracle(address(0x999));
    }

    function testMarketMakerAdapterOnlyOwner() public {
        vm.prank(address(0x123));
        vm.expectRevert();
        marketMakerAdapter.emergencyWithdrawToken(weth);
    }
}

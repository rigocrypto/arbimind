// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArbitrageAdapterV2V3} from "../src/adapters/ArbitrageAdapterV2V3.sol";

contract ArbitrageAdapterV2V3Test is Test {
    // Mainnet routers
    address constant UNIV3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address constant UNIV2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    // Tokens
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    ArbitrageAdapterV2V3 adapter;

    function setUp() public {
        // Create fork from env var
        string memory rpc = vm.envString("ETHEREUM_RPC_URL");
        vm.createSelectFork(rpc);

        // Deploy adapter with manager set to this test contract
        adapter = new ArbitrageAdapterV2V3(address(this), UNIV2_ROUTER, UNIV3_ROUTER);

        // Fund adapter with WETH for tokenIn
        deal(WETH, address(adapter), 1 ether);
    }

    function test_V3_then_V2_roundTrip_reverts_on_low_profit() public {
        // Build params
        ArbitrageAdapterV2V3.Params memory p;
        p.tokenIn = WETH;
        p.tokenOut = USDC;
        p.amountIn = 1 ether;
        p.minProfit = 0; // allow zero required profit for this exercise
        p.v2Path = new address[](2);
        p.v2Path[0] = USDC; // back to tokenIn on V2
        p.v2Path[1] = WETH;
        p.feeV3 = 3000; // 0.3%
        p.minOutV3 = 0;
        p.minOutV2 = 0;
        p.sqrtPriceLimitX96 = 0;
        p.deadline = block.timestamp + 600;

        bytes memory data = abi.encode(p);

        // Call as manager (this test contract is manager)
        vm.expectRevert(ArbitrageAdapterV2V3.ProfitBelowThreshold.selector);
        adapter.execute(data);
    }
}



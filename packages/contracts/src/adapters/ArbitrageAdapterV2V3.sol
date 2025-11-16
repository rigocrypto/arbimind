// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal Uniswap V2 Router interface (subset)
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @notice Minimal Uniswap V3 SwapRouter interface (subset)
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title ArbitrageAdapterV2V3
/// @notice Skeleton adapter routing tokenIn->tokenOut on V3 then back on V2, enforcing minProfit and slippage
/// @dev This is a non-flashloan skeleton to prove wiring; production should integrate flashloans and robust routing
contract ArbitrageAdapterV2V3 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable strategyManager; // only caller allowed
    IUniswapV2Router02 public immutable v2Router;
    ISwapRouter public immutable v3Router;

    uint256 public constant MAX_SLIPPAGE_BPS = 50; // 0.5%

    error NotManager();
    error InvalidAmount();
    error InsufficientBalance();
    error ProfitBelowThreshold();
    error ExcessiveSlippage();

    event ArbExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountBack, uint256 profit);

    constructor(address _manager, address _v2Router, address _v3Router) {
        strategyManager = _manager;
        v2Router = IUniswapV2Router02(_v2Router);
        v3Router = ISwapRouter(_v3Router);
    }

    struct Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minProfit;
        address[] v2Path; // e.g., [tokenOut, tokenIn]
        uint24 feeV3;     // e.g., 3000
        uint256 minOutV3; // safety on first hop
        uint256 minOutV2; // safety on second hop
        uint160 sqrtPriceLimitX96; // 0 to ignore
        uint256 deadline; // block.timestamp+N
    }

    /// @notice Manager entrypoint. Decodes Params, executes V3 then V2 swap, returns PnL and gas.
    function execute(bytes calldata data) external nonReentrant returns (int256 pnl, uint256 gasUsed) {
        if (msg.sender != strategyManager) revert NotManager();
        uint256 gasStart = gasleft();

        Params memory p = abi.decode(data, (Params));
        if (p.amountIn == 0) revert InvalidAmount();
        if (IERC20(p.tokenIn).balanceOf(address(this)) < p.amountIn) revert InsufficientBalance();
        if (p.deadline == 0) p.deadline = block.timestamp + 15;

        // approve for V3
        IERC20(p.tokenIn).safeIncreaseAllowance(address(v3Router), p.amountIn);
        uint256 outV3 = v3Router.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                fee: p.feeV3,
                recipient: address(this),
                deadline: p.deadline,
                amountIn: p.amountIn,
                amountOutMinimum: p.minOutV3,
                sqrtPriceLimitX96: p.sqrtPriceLimitX96
            })
        );

        // approve for V2 & swap back to tokenIn
        IERC20(p.tokenOut).safeIncreaseAllowance(address(v2Router), outV3);
        uint256[] memory amounts = v2Router.swapExactTokensForTokens(
            outV3,
            p.minOutV2,
            p.v2Path,
            address(this),
            p.deadline
        );
        uint256 back = amounts[amounts.length - 1];

        // compute profit
        if (back <= p.amountIn) revert ProfitBelowThreshold();
        uint256 profit = back - p.amountIn;
        if (profit < p.minProfit) revert ProfitBelowThreshold();

        // basic slippage guard relative to amountIn
        uint256 bps = (back * 10_000) / p.amountIn;
        if (bps + MAX_SLIPPAGE_BPS < 10_000) revert ExcessiveSlippage();

        emit ArbExecuted(p.tokenIn, p.tokenOut, p.amountIn, back, profit);

        // Return signed pnl in tokenIn units; gasUsed best-effort
        pnl = int256(profit);
        gasUsed = gasStart - gasleft();
    }
}



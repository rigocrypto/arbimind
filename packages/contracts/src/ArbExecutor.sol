// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArbExecutor
 * @dev Professional arbitrage execution contract for ArbiMind
 * @notice Executes atomic arbitrage trades across multiple DEXes
 */
contract ArbExecutor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event ArbitrageExecuted(
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountIn,
        uint256 amountOut,
        uint256 profit,
        address indexed dex1,
        address indexed dex2
    );

    event ProfitWithdrawn(
        address indexed token,
        address indexed treasury,
        uint256 amount
    );

    event ConfigUpdated(
        address indexed executor,
        address indexed treasury,
        uint256 minProfitThreshold
    );

    // ============ State Variables ============

    address public executor; // Off-chain bot address
    address public treasury; // Where profit is sent
    uint256 public minProfitThreshold; // Minimum profit to execute
    bool public paused;

    // DEX router addresses
    mapping(string => address) public dexRouters;
    mapping(address => bool) public allowedTokens;

    // ============ Modifiers ============

    modifier onlyExecutor() {
        require(msg.sender == executor, "ArbExecutor: not executor");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "ArbExecutor: paused");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _executor,
        address _treasury,
        uint256 _minProfitThreshold
    ) {
        require(_executor != address(0), "ArbExecutor: invalid executor");
        require(_treasury != address(0), "ArbExecutor: invalid treasury");
        
        executor = _executor;
        treasury = _treasury;
        minProfitThreshold = _minProfitThreshold;
        
        emit ConfigUpdated(_executor, _treasury, _minProfitThreshold);
    }

    // ============ Core Functions ============

    /**
     * @dev Execute arbitrage between Uniswap V2 and V3
     * @param tokenA First token in the arbitrage
     * @param tokenB Second token in the arbitrage
     * @param amountIn Amount of tokenA to start with
     * @param v2Router Uniswap V2 router address
     * @param v3Router Uniswap V3 router address
     * @param v3Fee V3 pool fee tier
     * @param minOutV2 Minimum output from V2 swap
     * @param minOutV3 Minimum output from V3 swap
     * @param deadline Transaction deadline
     */
    function executeArbV2V3(
        address tokenA,
        address tokenB,
        uint256 amountIn,
        address v2Router,
        address v3Router,
        uint24 v3Fee,
        uint256 minOutV2,
        uint256 minOutV3,
        uint256 deadline
    ) external nonReentrant onlyExecutor whenNotPaused {
        require(allowedTokens[tokenA] && allowedTokens[tokenB], "ArbExecutor: token not allowed");
        require(block.timestamp <= deadline, "ArbExecutor: expired");
        
        // Record initial balance
        uint256 balanceA0 = IERC20(tokenA).balanceOf(address(this));
        require(balanceA0 >= amountIn, "ArbExecutor: insufficient balance");

        // Step 1: Swap A -> B on V2
        _swapV2(tokenA, tokenB, amountIn, minOutV2, v2Router, deadline);
        
        // Step 2: Swap B -> A on V3
        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));
        _swapV3(tokenB, tokenA, balanceB, minOutV3, v3Router, v3Fee, deadline);

        // Calculate profit
        uint256 balanceA1 = IERC20(tokenA).balanceOf(address(this));
        uint256 profit = balanceA1 > balanceA0 ? balanceA1 - balanceA0 : 0;
        
        require(profit >= minProfitThreshold, "ArbExecutor: insufficient profit");

        // Send profit to treasury
        if (profit > 0) {
            IERC20(tokenA).safeTransfer(treasury, profit);
            emit ProfitWithdrawn(tokenA, treasury, profit);
        }

        emit ArbitrageExecuted(
            tokenA,
            tokenB,
            amountIn,
            balanceA1,
            profit,
            v2Router,
            v3Router
        );
    }

    /**
     * @dev Execute arbitrage using flash loan
     * @param tokenA First token in the arbitrage
     * @param tokenB Second token in the arbitrage
     * @param flashAmount Amount to flash loan
     * @param v2Router Uniswap V2 router address
     * @param v3Router Uniswap V3 router address
     * @param v3Fee V3 pool fee tier
     * @param minOutV2 Minimum output from V2 swap
     * @param minOutV3 Minimum output from V3 swap
     * @param deadline Transaction deadline
     */
    function executeFlashArb(
        address tokenA,
        address tokenB,
        uint256 flashAmount,
        address v2Router,
        address v3Router,
        uint24 v3Fee,
        uint256 minOutV2,
        uint256 minOutV3,
        uint256 deadline
    ) external nonReentrant onlyExecutor whenNotPaused {
        require(allowedTokens[tokenA] && allowedTokens[tokenB], "ArbExecutor: token not allowed");
        require(block.timestamp <= deadline, "ArbExecutor: expired");

        // Flash loan logic would be implemented here
        // For now, this is a placeholder for the flash loan implementation
        revert("ArbExecutor: flash loan not implemented yet");
    }

    // ============ Internal Functions ============

    function _swapV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address router,
        uint256 deadline
    ) internal {
        IERC20(tokenIn).safeApprove(router, 0);
        IERC20(tokenIn).safeApprove(router, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // Interface for V2 router
        (bool success, bytes memory data) = router.call(
            abi.encodeWithSelector(
                0x38ed1739, // swapExactTokensForTokens
                amountIn,
                amountOutMin,
                path,
                address(this),
                deadline
            )
        );

        require(success, "ArbExecutor: V2 swap failed");
        
        // Verify minimum output
        uint256 balanceOut = IERC20(tokenOut).balanceOf(address(this));
        require(balanceOut >= amountOutMin, "ArbExecutor: V2 slippage exceeded");
    }

    function _swapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address router,
        uint24 fee,
        uint256 deadline
    ) internal {
        IERC20(tokenIn).safeApprove(router, 0);
        IERC20(tokenIn).safeApprove(router, amountIn);

        // V3 exact input single parameters
        bytes memory params = abi.encodeWithSelector(
            0x04e45aaf, // exactInputSingle
            abi.encode(
                tokenIn,
                tokenOut,
                fee,
                address(this),
                deadline,
                amountIn,
                amountOutMin,
                0 // sqrtPriceLimitX96
            )
        );

        (bool success, ) = router.call(params);
        require(success, "ArbExecutor: V3 swap failed");
        
        // Verify minimum output
        uint256 balanceOut = IERC20(tokenOut).balanceOf(address(this));
        require(balanceOut >= amountOutMin, "ArbExecutor: V3 slippage exceeded");
    }

    // ============ Admin Functions ============

    function updateConfig(
        address _executor,
        address _treasury,
        uint256 _minProfitThreshold
    ) external onlyOwner {
        if (_executor != address(0)) executor = _executor;
        if (_treasury != address(0)) treasury = _treasury;
        minProfitThreshold = _minProfitThreshold;
        
        emit ConfigUpdated(_executor, _treasury, _minProfitThreshold);
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
    }

    function setDexRouter(string memory dexName, address router) external onlyOwner {
        dexRouters[dexName] = router;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function sweepToken(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(treasury, balance);
            emit ProfitWithdrawn(token, treasury, balance);
        }
    }

    function sweepETH() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = treasury.call{value: balance}("");
            require(success, "ArbExecutor: ETH transfer failed");
        }
    }

    // ============ View Functions ============

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ============ Emergency Functions ============

    receive() external payable {
        // Allow receiving ETH for flash loans
    }

    fallback() external payable {
        revert("ArbExecutor: invalid function call");
    }
}

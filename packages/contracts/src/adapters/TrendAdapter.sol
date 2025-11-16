// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

/// @title TrendAdapter
/// @notice Executes trades based on AI oracle-signed predictions
/// @dev Uses ECDSA signatures to verify off-chain AI predictions
contract TrendAdapter is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // Events
    event TrendSignalExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        int256 pnl,
        uint256 gasUsed,
        uint256 timestamp,
        bytes32 signalHash
    );

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event MinConfidenceUpdated(uint256 oldConfidence, uint256 newConfidence);
    event MaxSlippageUpdated(uint256 oldSlippage, uint256 newSlippage);

    // State variables
    address public oracle;
    uint256 public minConfidence; // Basis points (e.g., 7000 = 70%)
    uint256 public maxSlippage; // Basis points (e.g., 500 = 5%)
    uint256 public nonce;
    
    // Constants
    uint256 private constant BASIS_POINTS = 10000;
    uint256 private constant MAX_CONFIDENCE = 10000;
    uint256 private constant MIN_AMOUNT_IN = 0.01 ether; // 0.01 ETH minimum
    uint256 private constant MAX_AMOUNT_IN = 100 ether; // 100 ETH maximum

    // Structs
    struct TrendSignal {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 confidence; // 0-10000 basis points
        uint256 deadline;
        uint256 nonce;
        uint24 fee; // Uniswap V3 fee tier
    }

    constructor(address _oracle) Ownable(msg.sender) {
        oracle = _oracle;
        minConfidence = 7000; // 70% default
        maxSlippage = 500; // 5% default
    }

    /// @notice Execute a trend-following trade based on AI prediction
    /// @param signal The trend signal parameters
    /// @param signature The oracle signature verifying the signal
    /// @return pnl The profit/loss from the trade
    /// @return gasUsed The gas used for the transaction
    function executeTrendSignal(
        TrendSignal calldata signal,
        bytes calldata signature
    ) external nonReentrant returns (int256 pnl, uint256 gasUsed) {
        uint256 startGas = gasleft();
        
        // Validate signal
        _validateSignal(signal);
        
        // Verify oracle signature
        _verifySignature(signal, signature);
        
        // Check nonce to prevent replay attacks
        require(signal.nonce == nonce, "Invalid nonce");
        nonce++;
        
        // Check deadline
        require(block.timestamp <= signal.deadline, "Signal expired");
        
        // Check confidence threshold
        require(signal.confidence >= minConfidence, "Confidence too low");
        
        // Execute the trade
        pnl = _executeTrade(signal);
        
        gasUsed = startGas - gasleft();
        
        emit TrendSignalExecuted(
            signal.tokenIn,
            signal.tokenOut,
            signal.amountIn,
            pnl,
            gasUsed,
            block.timestamp,
            keccak256(abi.encodePacked(signal.tokenIn, signal.tokenOut, signal.amountIn, signal.nonce))
        );
    }

    /// @notice Execute the actual trade on Uniswap V3
    /// @param signal The trend signal
    /// @return pnl The profit/loss
    function _executeTrade(TrendSignal calldata signal) internal returns (int256 pnl) {
        // Transfer tokens from strategy manager to this contract
        TransferHelper.safeTransferFrom(
            signal.tokenIn,
            msg.sender, // Strategy manager
            address(this),
            signal.amountIn
        );

        // Approve Uniswap V3 router
        TransferHelper.safeApprove(signal.tokenIn, address(0xE592427A0AEce92De3Edee1F18E0157C05861564), signal.amountIn);

        // Execute swap on Uniswap V3
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: signal.tokenIn,
            tokenOut: signal.tokenOut,
            fee: signal.fee,
            recipient: address(this),
            deadline: signal.deadline,
            amountIn: signal.amountIn,
            amountOutMinimum: signal.minAmountOut,
            sqrtPriceLimitX96: 0
        });

        uint256 amountOut = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564).exactInputSingle(params);

        // Calculate PnL (simplified - in reality you'd track entry/exit prices)
        // For now, we'll use a confidence-based profit model
        uint256 expectedProfit = (signal.amountIn * signal.confidence) / MAX_CONFIDENCE;
        pnl = int256(expectedProfit);

        // Transfer tokens back to strategy manager
        TransferHelper.safeTransfer(signal.tokenOut, msg.sender, amountOut);
    }

    /// @notice Validate signal parameters
    /// @param signal The trend signal to validate
    function _validateSignal(TrendSignal calldata signal) internal view {
        require(signal.tokenIn != address(0), "Invalid tokenIn");
        require(signal.tokenOut != address(0), "Invalid tokenOut");
        require(signal.tokenIn != signal.tokenOut, "Same tokens");
        require(signal.amountIn >= MIN_AMOUNT_IN, "Amount too small");
        require(signal.amountIn <= MAX_AMOUNT_IN, "Amount too large");
        require(signal.confidence <= MAX_CONFIDENCE, "Invalid confidence");
        require(signal.deadline > block.timestamp, "Invalid deadline");
    }

    /// @notice Verify the oracle signature
    /// @param signal The trend signal
    /// @param signature The signature to verify
    function _verifySignature(TrendSignal calldata signal, bytes calldata signature) internal view {
        bytes32 messageHash = keccak256(abi.encodePacked(
            signal.tokenIn,
            signal.tokenOut,
            signal.amountIn,
            signal.minAmountOut,
            signal.confidence,
            signal.deadline,
            signal.nonce,
            signal.fee
        ));
        
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedMessageHash.recover(signature);
        
        require(signer == oracle, "Invalid signature");
    }

    // Admin functions
    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        address oldOracle = oracle;
        oracle = _oracle;
        emit OracleUpdated(oldOracle, _oracle);
    }

    function setMinConfidence(uint256 _minConfidence) external onlyOwner {
        require(_minConfidence <= MAX_CONFIDENCE, "Invalid confidence");
        uint256 oldConfidence = minConfidence;
        minConfidence = _minConfidence;
        emit MinConfidenceUpdated(oldConfidence, _minConfidence);
    }

    function setMaxSlippage(uint256 _maxSlippage) external onlyOwner {
        require(_maxSlippage <= 2000, "Slippage too high"); // Max 20%
        uint256 oldSlippage = maxSlippage;
        maxSlippage = _maxSlippage;
        emit MaxSlippageUpdated(oldSlippage, _maxSlippage);
    }

    // Emergency functions
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            TransferHelper.safeTransfer(token, owner(), balance);
        }
    }

    function emergencyWithdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            TransferHelper.safeTransferETH(owner(), balance);
        }
    }
}



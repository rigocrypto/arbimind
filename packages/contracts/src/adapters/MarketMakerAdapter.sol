// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

/// @title MarketMakerAdapter
/// @notice Provides liquidity to Uniswap V3 pools and manages positions
/// @dev Implements concentrated liquidity market making with dynamic rebalancing
contract MarketMakerAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Events
    event LiquidityAdded(
        uint256 indexed tokenId,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper
    );

    event LiquidityRemoved(
        uint256 indexed tokenId,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 fees0,
        uint256 fees1
    );

    event PositionRebalanced(
        uint256 indexed tokenId,
        int24 oldTickLower,
        int24 oldTickUpper,
        int24 newTickLower,
        int24 newTickUpper
    );

    event FeesCollected(
        uint256 indexed tokenId,
        uint256 fees0,
        uint256 fees1,
        uint256 timestamp
    );

    // State variables
    INonfungiblePositionManager public immutable positionManager;
    IUniswapV3Factory public immutable factory;
    mapping(uint256 => PositionInfo) public positions;
    uint256 public totalPositions;
    
    // Constants
    uint256 private constant MIN_LIQUIDITY = 0.001 ether;
    uint256 private constant MAX_SLIPPAGE_BPS = 500; // 5%
    uint24 private constant DEFAULT_FEE = 3000; // 0.3%

    // Structs
    struct PositionInfo {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 liquidity;
        uint256 fees0;
        uint256 fees1;
        bool active;
    }

    struct AddLiquidityParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    constructor(address _positionManager, address _factory) Ownable(msg.sender) {
        positionManager = INonfungiblePositionManager(_positionManager);
        factory = IUniswapV3Factory(_factory);
    }

    /// @notice Add liquidity to a Uniswap V3 pool
    /// @param params Liquidity parameters
    /// @return tokenId The NFT token ID representing the position
    /// @return liquidity The amount of liquidity added
    /// @return amount0 The amount of token0 added
    /// @return amount1 The amount of token1 added
    function addLiquidity(AddLiquidityParams calldata params)
        external
        nonReentrant
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(params.token0 < params.token1, "Token order");
        require(params.amount0Desired >= MIN_LIQUIDITY, "Amount too small");
        require(params.amount1Desired >= MIN_LIQUIDITY, "Amount too small");
        require(params.tickLower < params.tickUpper, "Invalid tick range");

        // Transfer tokens from strategy manager
        TransferHelper.safeTransferFrom(params.token0, msg.sender, address(this), params.amount0Desired);
        TransferHelper.safeTransferFrom(params.token1, msg.sender, address(this), params.amount1Desired);

        // Approve position manager
        TransferHelper.safeApprove(params.token0, address(positionManager), params.amount0Desired);
        TransferHelper.safeApprove(params.token1, address(positionManager), params.amount1Desired);

        // Create position
        INonfungiblePositionManager.MintParams memory mintParams = INonfungiblePositionManager.MintParams({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            amount0Desired: params.amount0Desired,
            amount1Desired: params.amount1Desired,
            amount0Min: params.amount0Min,
            amount1Min: params.amount1Min,
            recipient: address(this),
            deadline: block.timestamp + 300 // 5 minutes
        });

        (tokenId, liquidity, amount0, amount1) = positionManager.mint(mintParams);

        // Store position info
        positions[tokenId] = PositionInfo({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            fees0: 0,
            fees1: 0,
            active: true
        });

        totalPositions++;

        emit LiquidityAdded(
            tokenId,
            params.token0,
            params.token1,
            amount0,
            amount1,
            params.fee,
            params.tickLower,
            params.tickUpper
        );
    }

    /// @notice Remove liquidity from a position
    /// @param tokenId The position NFT token ID
    /// @param liquidity The amount of liquidity to remove
    /// @param amount0Min Minimum amount of token0 to receive
    /// @param amount1Min Minimum amount of token1 to receive
    /// @return amount0 Amount of token0 received
    /// @return amount1 Amount of token1 received
    function removeLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        PositionInfo storage position = positions[tokenId];
        require(position.active, "Position not active");
        require(liquidity <= position.liquidity, "Insufficient liquidity");

        // Approve position manager to burn liquidity
        positionManager.approve(address(this), tokenId);

        // Remove liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams memory decreaseParams = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: tokenId,
            liquidity: liquidity,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: block.timestamp + 300
        });

        (amount0, amount1) = positionManager.decreaseLiquidity(decreaseParams);

        // Collect fees
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (uint256 fees0, uint256 fees1) = positionManager.collect(collectParams);

        // Update position
        position.liquidity -= liquidity;
        position.fees0 += fees0;
        position.fees1 += fees1;

        if (position.liquidity == 0) {
            position.active = false;
        }

        // Transfer tokens back to strategy manager
        TransferHelper.safeTransfer(position.token0, msg.sender, amount0 + fees0);
        TransferHelper.safeTransfer(position.token1, msg.sender, amount1 + fees1);

        emit LiquidityRemoved(tokenId, position.token0, position.token1, amount0, amount1, fees0, fees1);
        emit FeesCollected(tokenId, fees0, fees1, block.timestamp);
    }

    /// @notice Collect fees from a position without removing liquidity
    /// @param tokenId The position NFT token ID
    /// @return fees0 Amount of token0 fees collected
    /// @return fees1 Amount of token1 fees collected
    function collectFees(uint256 tokenId) external nonReentrant returns (uint256 fees0, uint256 fees1) {
        PositionInfo storage position = positions[tokenId];
        require(position.active, "Position not active");

        // Approve position manager
        positionManager.approve(address(this), tokenId);

        // Collect fees
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (fees0, fees1) = positionManager.collect(collectParams);

        // Update position
        position.fees0 += fees0;
        position.fees1 += fees1;

        // Transfer fees to strategy manager
        TransferHelper.safeTransfer(position.token0, msg.sender, fees0);
        TransferHelper.safeTransfer(position.token1, msg.sender, fees1);

        emit FeesCollected(tokenId, fees0, fees1, block.timestamp);
    }

    /// @notice Rebalance a position by adjusting tick range
    /// @param tokenId The position NFT token ID
    /// @param newTickLower New lower tick
    /// @param newTickUpper New upper tick
    /// @param amount0Min Minimum amount of token0 to receive
    /// @param amount1Min Minimum amount of token1 to receive
    function rebalancePosition(
        uint256 tokenId,
        int24 newTickLower,
        int24 newTickUpper,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant {
        PositionInfo storage position = positions[tokenId];
        require(position.active, "Position not active");
        require(newTickLower < newTickUpper, "Invalid tick range");

        // Remove all liquidity from current position
        uint256 amount0;
        uint256 amount1;
        (amount0, amount1) = this.removeLiquidity(tokenId, uint128(position.liquidity), amount0Min, amount1Min);

        // Add liquidity to new position
        AddLiquidityParams memory params = AddLiquidityParams({
            token0: position.token0,
            token1: position.token1,
            fee: position.fee,
            tickLower: newTickLower,
            tickUpper: newTickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: amount0Min,
            amount1Min: amount1Min
        });

        this.addLiquidity(params);

        emit PositionRebalanced(tokenId, position.tickLower, position.tickUpper, newTickLower, newTickUpper);
    }

    /// @notice Get position information
    /// @param tokenId The position NFT token ID
    /// @return info The position information
    function getPosition(uint256 tokenId) external view returns (PositionInfo memory info) {
        return positions[tokenId];
    }

    /// @notice Get all active positions
    /// @return activePositions Array of active position token IDs
    function getActivePositions() external view returns (uint256[] memory activePositions) {
        uint256 count = 0;
        for (uint256 i = 0; i < totalPositions; i++) {
            if (positions[i].active) {
                count++;
            }
        }

        activePositions = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < totalPositions; i++) {
            if (positions[i].active) {
                activePositions[index] = i;
                index++;
            }
        }
    }

    // Emergency functions
    function emergencyWithdrawToken(address token) external onlyOwner {
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

    // Required for receiving ETH
    receive() external payable {}
}



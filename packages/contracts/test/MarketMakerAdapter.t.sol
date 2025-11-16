// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MarketMakerAdapter} from "../src/adapters/MarketMakerAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IUniswapV3PositionManager} from "@uniswap/v3-periphery/contracts/interfaces/IUniswapV3PositionManager.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

contract MarketMakerAdapterTest is Test {
    MarketMakerAdapter public adapter;
    address public owner;
    address public executor;
    
    // Mock addresses for testing
    address public mockPositionManager;
    address public mockFactory;
    address public mockPool;
    address public mockToken0;
    address public mockToken1;
    
    uint24 public constant FEE_TIER = 3000; // 0.3%
    int24 public constant TICK_SPACING = 60;
    
    event LiquidityAdded(uint256 indexed positionId, address indexed pool, uint128 liquidity);
    event LiquidityRemoved(uint256 indexed positionId, uint128 liquidity);
    event FeesCollected(uint256 indexed positionId, uint256 amount0, uint256 amount1);
    event PositionRebalanced(uint256 indexed positionId, int24 newTickLower, int24 newTickUpper);

    function setUp() public {
        owner = address(this);
        executor = address(0x123);
        
        // Deploy mock contracts
        mockPositionManager = address(new MockPositionManager());
        mockFactory = address(new MockFactory());
        mockPool = address(new MockPool());
        mockToken0 = address(new MockERC20("Token0", "TK0"));
        mockToken1 = address(new MockERC20("Token1", "TK1"));
        
        adapter = new MarketMakerAdapter(mockPositionManager, mockFactory);
        
        // Set executor
        adapter.setExecutor(executor);
    }

    function test_Constructor() public {
        assertEq(adapter.positionManager(), mockPositionManager);
        assertEq(adapter.factory(), mockFactory);
        assertEq(adapter.owner(), owner);
    }

    function test_AddLiquidity() public {
        vm.startPrank(executor);
        
        uint256 amount0Desired = 1000e18;
        uint256 amount1Desired = 1000e18;
        int24 tickLower = -6000;
        int24 tickUpper = 6000;
        uint256 deadline = block.timestamp + 3600;
        
        // Mock token approvals
        MockERC20(mockToken0).mint(address(adapter), amount0Desired);
        MockERC20(mockToken1).mint(address(adapter), amount1Desired);
        
        uint256 positionId = adapter.addLiquidity(
            mockToken0,
            mockToken1,
            FEE_TIER,
            amount0Desired,
            amount1Desired,
            tickLower,
            tickUpper,
            deadline
        );
        
        assertEq(positionId, 1); // Mock returns 1
        
        vm.stopPrank();
    }

    function test_RemoveLiquidity() public {
        vm.startPrank(executor);
        
        uint256 positionId = 1;
        uint128 liquidity = 1000;
        uint256 deadline = block.timestamp + 3600;
        
        adapter.removeLiquidity(positionId, liquidity, deadline);
        
        vm.stopPrank();
    }

    function test_CollectFees() public {
        vm.startPrank(executor);
        
        uint256 positionId = 1;
        uint128 amount0Max = type(uint128).max;
        uint128 amount1Max = type(uint128).max;
        
        adapter.collectFees(positionId, amount0Max, amount1Max);
        
        vm.stopPrank();
    }

    function test_RebalancePosition() public {
        vm.startPrank(executor);
        
        uint256 positionId = 1;
        int24 newTickLower = -8000;
        int24 newTickUpper = 8000;
        uint256 deadline = block.timestamp + 3600;
        
        adapter.rebalancePosition(positionId, newTickLower, newTickUpper, deadline);
        
        vm.stopPrank();
    }

    function test_GetPosition() public {
        uint256 positionId = 1;
        
        (uint96 nonce, address operator, address token0, address token1, uint24 fee, 
         int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128,
         uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1) = adapter.getPosition(positionId);
        
        // Mock values - in real test would check actual values
        assertEq(token0, mockToken0);
        assertEq(token1, mockToken1);
        assertEq(fee, FEE_TIER);
    }

    function test_GetActivePositions() public {
        uint256[] memory positions = adapter.getActivePositions();
        // Mock returns empty array
        assertEq(positions.length, 0);
    }

    function test_EmergencyWithdrawToken() public {
        address token = mockToken0;
        address to = address(0x456);
        uint256 amount = 1000e18;
        
        // Mint tokens to adapter
        MockERC20(token).mint(address(adapter), amount);
        
        adapter.emergencyWithdrawToken(token, to, amount);
        
        assertEq(MockERC20(token).balanceOf(to), amount);
    }

    function test_EmergencyWithdrawETH() public {
        address to = address(0x456);
        uint256 amount = 1 ether;
        
        // Send ETH to adapter
        payable(address(adapter)).transfer(amount);
        
        adapter.emergencyWithdrawETH(to, amount);
        
        assertEq(to.balance, amount);
    }

    function test_RevertWhenNotExecutor() public {
        vm.startPrank(address(0x999));
        
        vm.expectRevert("Only executor");
        adapter.addLiquidity(
            mockToken0,
            mockToken1,
            FEE_TIER,
            1000e18,
            1000e18,
            -6000,
            6000,
            block.timestamp + 3600
        );
        
        vm.stopPrank();
    }

    function test_RevertWhenNotOwner() public {
        vm.startPrank(address(0x999));
        
        vm.expectRevert("Ownable: caller is not the owner");
        adapter.setExecutor(address(0x123));
        
        vm.stopPrank();
    }

    function test_SetExecutor() public {
        address newExecutor = address(0x789);
        
        adapter.setExecutor(newExecutor);
        
        assertEq(adapter.executor(), newExecutor);
    }

    receive() external payable {}
}

// Mock contracts for testing
contract MockPositionManager {
    function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        return (1, uint128(params.amount0Desired), params.amount0Desired, params.amount1Desired);
    }
    
    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        return (params.liquidity, params.liquidity);
    }
    
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        return (params.amount0Max, params.amount1Max);
    }
    
    function positions(uint256 tokenId) external view returns (
        uint96 nonce,
        address operator,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) {
        return (0, address(0), address(0), address(0), 3000, -6000, 6000, 1000, 0, 0, 0, 0);
    }
    
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    
    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }
    
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }
}

contract MockFactory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool) {
        return address(1); // Mock pool address
    }
}

contract MockPool {
    function token0() external view returns (address) { return address(0); }
    function token1() external view returns (address) { return address(0); }
    function fee() external view returns (uint24) { return 3000; }
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}

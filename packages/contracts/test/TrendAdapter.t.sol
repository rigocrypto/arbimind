// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {TrendAdapter} from "../src/adapters/TrendAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Router} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract TrendAdapterTest is Test {
    TrendAdapter public adapter;
    address public owner;
    address public executor;
    address public oracle;
    
    // Mock addresses for testing
    address public mockRouter;
    address public mockToken0;
    address public mockToken1;
    
    uint24 public constant FEE_TIER = 3000; // 0.3%
    
    event TrendSignalExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint8 confidence,
        uint256 timestamp
    );
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event MinConfidenceUpdated(uint8 oldConfidence, uint8 newConfidence);
    event MaxSlippageUpdated(uint16 oldSlippage, uint16 newSlippage);

    function setUp() public {
        owner = address(this);
        executor = address(0x123);
        oracle = address(0x456);
        
        // Deploy mock contracts
        mockRouter = address(new MockRouter());
        mockToken0 = address(new MockERC20("Token0", "TK0"));
        mockToken1 = address(new MockERC20("Token1", "TK1"));
        
        adapter = new TrendAdapter(oracle);
        
        // Set executor
        adapter.setExecutor(executor);
    }

    function test_Constructor() public {
        assertEq(adapter.oracle(), oracle);
        assertEq(adapter.owner(), owner);
        assertEq(adapter.minConfidence(), 70); // Default 70%
        assertEq(adapter.maxSlippage(), 500); // Default 5%
    }

    function test_ExecuteTrendSignal() public {
        vm.startPrank(executor);
        
        address tokenIn = mockToken0;
        address tokenOut = mockToken1;
        uint256 amountIn = 1000e18;
        uint256 minAmountOut = 950e18;
        uint8 confidence = 85;
        uint256 timestamp = block.timestamp;
        uint256 deadline = block.timestamp + 3600;
        
        // Create signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp
        ));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracle, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Mock token balance
        MockERC20(tokenIn).mint(address(adapter), amountIn);
        
        adapter.executeTrendSignal(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp,
            signature,
            deadline
        );
        
        vm.stopPrank();
    }

    function test_RevertWhenConfidenceTooLow() public {
        vm.startPrank(executor);
        
        address tokenIn = mockToken0;
        address tokenOut = mockToken1;
        uint256 amountIn = 1000e18;
        uint256 minAmountOut = 950e18;
        uint8 confidence = 50; // Below 70% threshold
        uint256 timestamp = block.timestamp;
        uint256 deadline = block.timestamp + 3600;
        
        // Create signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp
        ));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracle, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Mock token balance
        MockERC20(tokenIn).mint(address(adapter), amountIn);
        
        vm.expectRevert("Confidence too low");
        adapter.executeTrendSignal(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp,
            signature,
            deadline
        );
        
        vm.stopPrank();
    }

    function test_RevertWhenSignatureInvalid() public {
        vm.startPrank(executor);
        
        address tokenIn = mockToken0;
        address tokenOut = mockToken1;
        uint256 amountIn = 1000e18;
        uint256 minAmountOut = 950e18;
        uint8 confidence = 85;
        uint256 timestamp = block.timestamp;
        uint256 deadline = block.timestamp + 3600;
        
        // Create invalid signature (wrong signer)
        bytes32 messageHash = keccak256(abi.encodePacked(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp
        ));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(address(0x999), ethSignedMessageHash); // Wrong signer
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Mock token balance
        MockERC20(tokenIn).mint(address(adapter), amountIn);
        
        vm.expectRevert("Invalid signature");
        adapter.executeTrendSignal(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp,
            signature,
            deadline
        );
        
        vm.stopPrank();
    }

    function test_RevertWhenTimestampExpired() public {
        vm.startPrank(executor);
        
        address tokenIn = mockToken0;
        address tokenOut = mockToken1;
        uint256 amountIn = 1000e18;
        uint256 minAmountOut = 950e18;
        uint8 confidence = 85;
        uint256 timestamp = block.timestamp - 3600; // 1 hour ago
        uint256 deadline = block.timestamp + 3600;
        
        // Create signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp
        ));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracle, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Mock token balance
        MockERC20(tokenIn).mint(address(adapter), amountIn);
        
        vm.expectRevert("Signal expired");
        adapter.executeTrendSignal(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            confidence,
            timestamp,
            signature,
            deadline
        );
        
        vm.stopPrank();
    }

    function test_SetOracle() public {
        address newOracle = address(0x789);
        
        adapter.setOracle(newOracle);
        
        assertEq(adapter.oracle(), newOracle);
    }

    function test_SetMinConfidence() public {
        uint8 newConfidence = 80;
        
        adapter.setMinConfidence(newConfidence);
        
        assertEq(adapter.minConfidence(), newConfidence);
    }

    function test_SetMaxSlippage() public {
        uint16 newSlippage = 300; // 3%
        
        adapter.setMaxSlippage(newSlippage);
        
        assertEq(adapter.maxSlippage(), newSlippage);
    }

    function test_EmergencyWithdrawToken() public {
        address token = mockToken0;
        address to = address(0x999);
        uint256 amount = 1000e18;
        
        // Mint tokens to adapter
        MockERC20(token).mint(address(adapter), amount);
        
        adapter.emergencyWithdrawToken(token, to, amount);
        
        assertEq(MockERC20(token).balanceOf(to), amount);
    }

    function test_EmergencyWithdrawETH() public {
        address to = address(0x999);
        uint256 amount = 1 ether;
        
        // Send ETH to adapter
        payable(address(adapter)).transfer(amount);
        
        adapter.emergencyWithdrawETH(to, amount);
        
        assertEq(to.balance, amount);
    }

    function test_RevertWhenNotExecutor() public {
        vm.startPrank(address(0x999));
        
        vm.expectRevert("Only executor");
        adapter.executeTrendSignal(
            mockToken0,
            mockToken1,
            1000e18,
            950e18,
            85,
            block.timestamp,
            "",
            block.timestamp + 3600
        );
        
        vm.stopPrank();
    }

    function test_RevertWhenNotOwner() public {
        vm.startPrank(address(0x999));
        
        vm.expectRevert("Ownable: caller is not the owner");
        adapter.setOracle(address(0x123));
        
        vm.stopPrank();
    }

    function test_RevertWhenConfidenceTooHigh() public {
        vm.expectRevert("Confidence must be <= 100");
        adapter.setMinConfidence(101);
    }

    function test_RevertWhenSlippageTooHigh() public {
        vm.expectRevert("Slippage must be <= 10000");
        adapter.setMaxSlippage(10001);
    }

    receive() external payable {}
}

// Mock contracts for testing
contract MockRouter {
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        return params.amountIn * 95 / 100; // Mock 5% slippage
    }
    
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

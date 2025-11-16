// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ArbiMindStrategyManager
/// @notice Strategy manager that routes execution to pluggable strategy adapters and enforces risk limits
/// @dev Adapters implement IStrategyAdapter and encapsulate specific strategy logic (arbitrage, trend, market-making)
contract ArbiMindStrategyManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Interfaces ============

    /// @notice Minimal adapter interface each strategy must implement
    interface IStrategyAdapter {
        /// @param params ABI-encoded strategy-specific params
        /// @return pnl Signed PnL in wei (positive = profit, negative = loss)
        /// @return gasUsed Best-effort gas used reported by the adapter (optional, can be 0)
        function execute(bytes calldata params) external payable returns (int256 pnl, uint256 gasUsed);
    }

    // ============ Errors ============

    error InvalidStrategyId();
    error StrategyAlreadyExists();
    error StrategyNotEnabled();
    error InvalidAllocation();
    error AllocationSumExceeded();
    error NotExecutor();
    error DailyLossLimitExceeded();

    // ============ Events ============

    event StrategyRegistered(bytes32 indexed id, address adapter);
    event StrategyUpdated(bytes32 indexed id, address adapter, bool enabled, uint16 allocationBps);
    event StrategyExecuted(bytes32 indexed id, int256 pnl, uint256 gasUsed, address indexed caller);
    event ExecutorUpdated(address indexed executor);
    event TreasuryUpdated(address indexed treasury);
    event MaxDailyLossUpdated(uint256 maxDailyLossWei);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // ============ Storage ============

    struct Strategy {
        address adapter;       // Strategy adapter contract
        bool enabled;          // Whether the strategy can be executed
        uint16 allocationBps;  // Allocation in basis points (0-10000)
    }

    // id => strategy
    mapping(bytes32 => Strategy) public strategies;
    // keep a list of ids for enumeration
    bytes32[] public strategyIds;

    // Who can trigger on-chain execution (typically the off-chain bot/searcher)
    address public executor;

    // Where profits (if any) are ultimately swept to (managed by ops)
    address public treasury;

    // Risk: absolute max cumulative loss allowed per UTC day (in wei)
    uint256 public maxDailyLossWei;

    // Track cumulative daily PnL (only losses are enforced against the limit)
    uint256 public currentDay;      // yyyyMMdd (UTC) as uint, e.g., 20250821
    int256 public dailyNetPnlWei;   // can be negative or positive; enforce negative bound

    // Sum of allocation BPS across enabled strategies
    uint16 public totalAllocationBps;

    // ============ Modifiers ============

    modifier onlyExecutor() {
        if (msg.sender != executor && msg.sender != owner()) revert NotExecutor();
        _;
    }

    // ============ Constructor ============

    constructor(address _executor, address _treasury, uint256 _maxDailyLossWei) {
        executor = _executor;
        treasury = _treasury;
        maxDailyLossWei = _maxDailyLossWei;
        _rollDayIfNeeded();
    }

    // ============ Strategy Management ============

    /// @notice Register a new strategy adapter under a unique id
    function registerStrategy(bytes32 id, address adapter) external onlyOwner {
        if (id == bytes32(0)) revert InvalidStrategyId();
        if (strategies[id].adapter != address(0)) revert StrategyAlreadyExists();
        strategies[id] = Strategy({adapter: adapter, enabled: false, allocationBps: 0});
        strategyIds.push(id);
        emit StrategyRegistered(id, adapter);
    }

    /// @notice Update strategy adapter address, enabled flag, or allocation
    function updateStrategy(bytes32 id, address adapter, bool enabled, uint16 allocationBps) external onlyOwner {
        Strategy storage s = strategies[id];
        if (s.adapter == address(0)) revert InvalidStrategyId();

        // adjust total allocation
        if (enabled) {
            // remove old allocation then add new to avoid overflow
            totalAllocationBps = _subBps(totalAllocationBps, s.allocationBps);
            totalAllocationBps = _addBps(totalAllocationBps, allocationBps);
            if (totalAllocationBps > 10_000) revert AllocationSumExceeded();
        } else {
            // if disabling, remove its current allocation from the sum
            totalAllocationBps = _subBps(totalAllocationBps, s.allocationBps);
        }

        if (adapter != address(0)) {
            s.adapter = adapter;
        }
        s.enabled = enabled;
        s.allocationBps = enabled ? allocationBps : 0;

        emit StrategyUpdated(id, s.adapter, s.enabled, s.allocationBps);
    }

    /// @notice Batch set allocations; ids and bps arrays must match length
    function setAllocations(bytes32[] calldata ids, uint16[] calldata bps) external onlyOwner {
        if (ids.length != bps.length) revert InvalidAllocation();
        uint16 newTotal = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            Strategy storage s = strategies[ids[i]];
            if (s.adapter == address(0) || !s.enabled) revert InvalidStrategyId();
            s.allocationBps = bps[i];
            newTotal = _addBps(newTotal, bps[i]);
        }
        if (newTotal > 10_000) revert AllocationSumExceeded();
        totalAllocationBps = newTotal;
    }

    /// @notice Returns all registered strategy ids
    function getStrategyIds() external view returns (bytes32[] memory) {
        return strategyIds;
    }

    // ============ Execution ============

    /// @notice Execute a specific strategy with params
    /// @dev Enforces pause state and daily loss limit. Off-chain bot should pre-simulate and send only profitable bundles.
    function executeStrategy(bytes32 id, bytes calldata params)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyExecutor
    {
        _rollDayIfNeeded();

        Strategy memory s = strategies[id];
        if (s.adapter == address(0)) revert InvalidStrategyId();
        if (!s.enabled) revert StrategyNotEnabled();

        (int256 pnl, uint256 gasUsed) = IStrategyAdapter(s.adapter).execute{value: msg.value}(params);

        // Update daily net pnl and enforce loss limit
        if (pnl < 0) {
            // sum negative PnL only for enforcement
            int256 newDaily = dailyNetPnlWei + pnl;
            // convert to absolute loss for comparison
            uint256 absLoss = uint256(-newDaily);
            // if cumulative loss exceeds limit, revert
            if (absLoss > maxDailyLossWei) revert DailyLossLimitExceeded();
            dailyNetPnlWei = newDaily;
        } else if (pnl > 0) {
            dailyNetPnlWei += pnl;
        }

        emit StrategyExecuted(id, pnl, gasUsed, msg.sender);
    }

    // ============ Admin ============

    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
        emit ExecutorUpdated(_executor);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setMaxDailyLossWei(uint256 _maxDailyLossWei) external onlyOwner {
        maxDailyLossWei = _maxDailyLossWei;
        emit MaxDailyLossUpdated(_maxDailyLossWei);
    }

    function pause() external onlyOwner {
        _pause();
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit Unpaused(msg.sender);
    }

    // ============ Sweeps ============

    function sweepToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(treasury, amount);
    }

    function sweepETH(uint256 amount) external onlyOwner {
        (bool ok, ) = payable(treasury).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    // ============ Internal helpers ============

    function _addBps(uint16 a, uint16 b) internal pure returns (uint16) {
        uint256 c = uint256(a) + uint256(b);
        require(c <= type(uint16).max, "overflow");
        return uint16(c);
    }

    function _subBps(uint16 a, uint16 b) internal pure returns (uint16) {
        require(a >= b, "underflow");
        return a - b;
    }

    function _rollDayIfNeeded() internal {
        uint256 today = _yyyymmdd(block.timestamp);
        if (today != currentDay) {
            currentDay = today;
            dailyNetPnlWei = 0; // reset for new day
        }
    }

    function _yyyymmdd(uint256 ts) internal pure returns (uint256) {
        // Compute UTC date as yyyymmdd using Unix timestamp
        // Simplified approach leveraging days since epoch
        uint256 daysSinceEpoch = ts / 1 days;
        // Unix epoch 1970-01-01, roughly convert back (not accounting leap seconds; fine for limit bucketing)
        // For simplicity and gas, approximate using a known library would be better; here we bucket by daysSinceEpoch directly.
        return daysSinceEpoch;
    }

    // receive ETH for strategies that need it (e.g., gas refunds, native flow)
    receive() external payable {}
}



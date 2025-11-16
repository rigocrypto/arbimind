// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ArbitrageAdapter (mock)
/// @notice Deterministic mock that returns a small profit, for wiring and tests
contract ArbitrageAdapter {
    address public immutable tokenA;
    address public immutable tokenB;
    address public owner;

    constructor(address _tokenA, address _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
        owner = msg.sender;
    }

    /// @notice Manager calls this; signature must match manager's expected adapter ABI
    /// @dev returns fixed profit of +100 and gasUsed heuristic
    function execute(bytes calldata /*params*/)
        external
        returns (int256 pnl, uint256 gasUsed)
    {
        pnl = int256(100);
        gasUsed = 120_000;
    }

    function sweep(address token, address to) external {
        require(msg.sender == owner, "only-owner");
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, bal);
    }
}



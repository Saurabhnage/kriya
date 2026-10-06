// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC - testnet-only USDC with a public faucet
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_LIMIT = 10_000e6;

    error FaucetLimit();

    constructor() ERC20("KRIYA Test USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone can mint up to 10,000 test USDC per call.
    function faucet(address to, uint256 amount) external {
        if (amount > FAUCET_LIMIT) revert FaucetLimit();
        _mint(to, amount);
    }
}

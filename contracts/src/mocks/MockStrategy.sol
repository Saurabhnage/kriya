// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MockStrategy - a controlled testnet strategy vault
/// @notice Really holds the USDC allocated to it. Only the KRIYA vault can move funds out,
///         and only back to itself. Yield is a displayed parameter, not accrued.
contract MockStrategy {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public immutable vault;
    string public name;

    error OnlyVault();

    constructor(IERC20 _asset, address _vault, string memory _name) {
        asset = _asset;
        vault = _vault;
        name = _name;
    }

    function totalAssets() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Return funds to the vault. Destination is hard-wired to the vault.
    function release(uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        asset.safeTransfer(vault, amount);
    }
}

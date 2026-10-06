// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title KriyaMandate - programmable financial objectives
/// @notice A mandate is the user's hard boundary: the agent can only propose allocations,
///         and the executor only executes allocations that satisfy the mandate.
contract KriyaMandate is Ownable {
    struct Params {
        uint16 maxRisk; // max risk score (0-100) for any held strategy AND for the portfolio
        uint16 maxExposureBps; // max share of capital in any single strategy
        uint16 maxDrawdownBps; // max loss from high-water mark before execution is refused
        uint16 minReserveBps; // liquidity requirement: min share kept in USDC reserve
        bool autoRebalance;
        string objective;
    }

    struct Mandate {
        Params params;
        address[] allowedStrategies;
        bool active;
        uint64 createdAt;
        uint64 updatedAt;
    }

    address public vault;
    address[] private s_users;
    mapping(address => Mandate) private s_mandates;
    mapping(address => mapping(address => bool)) private s_allowed;

    event MandateSet(address indexed user, Params params, address[] allowedStrategies);
    event MandateStatusChanged(address indexed user, bool active);
    event VaultSet(address vault);

    error NotAuthorized();
    error InvalidParams(string reason);
    error NoMandate(address user);

    constructor() Ownable(msg.sender) {}

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
        emit VaultSet(_vault);
    }

    /// @notice Create or replace your own mandate.
    function setMandate(Params calldata params, address[] calldata allowedStrategies) external {
        _setMandate(msg.sender, params, allowedStrategies);
    }

    /// @notice Lets the vault open a mandate atomically with a deposit (single user tx).
    function setMandateFor(address user, Params calldata params, address[] calldata allowedStrategies) external {
        if (msg.sender != vault) revert NotAuthorized();
        _setMandate(user, params, allowedStrategies);
    }

    /// @notice Human override: pause or resume the agent's authority over your capital.
    function setActive(bool active) external {
        if (s_mandates[msg.sender].createdAt == 0) revert NoMandate(msg.sender);
        s_mandates[msg.sender].active = active;
        emit MandateStatusChanged(msg.sender, active);
    }

    function _setMandate(address user, Params calldata params, address[] calldata allowedStrategies) internal {
        if (params.maxRisk == 0 || params.maxRisk > 100) revert InvalidParams("maxRisk");
        if (params.maxExposureBps == 0 || params.maxExposureBps > 10_000) revert InvalidParams("maxExposure");
        if (params.maxDrawdownBps > 10_000) revert InvalidParams("maxDrawdown");
        if (params.minReserveBps > 10_000) revert InvalidParams("minReserve");

        Mandate storage m = s_mandates[user];
        for (uint256 i = 0; i < m.allowedStrategies.length; i++) {
            s_allowed[user][m.allowedStrategies[i]] = false;
        }
        for (uint256 i = 0; i < allowedStrategies.length; i++) {
            s_allowed[user][allowedStrategies[i]] = true;
        }
        if (m.createdAt == 0) {
            m.createdAt = uint64(block.timestamp);
            s_users.push(user);
        }
        m.params = params;
        m.allowedStrategies = allowedStrategies;
        m.active = true;
        m.updatedAt = uint64(block.timestamp);
        emit MandateSet(user, params, allowedStrategies);
        emit MandateStatusChanged(user, true);
    }

    function getMandate(address user) external view returns (Mandate memory) {
        return s_mandates[user];
    }

    function isAllowed(address user, address strategy) external view returns (bool) {
        return s_allowed[user][strategy];
    }

    function isActive(address user) external view returns (bool) {
        return s_mandates[user].active;
    }

    function users() external view returns (address[] memory) {
        return s_users;
    }
}

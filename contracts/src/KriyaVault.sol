// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {KriyaMandate} from "./KriyaMandate.sol";
import {KriyaStrategyRegistry} from "./KriyaStrategyRegistry.sol";

interface IStrategy {
    function release(uint256 amount) external;
}

/// @title KriyaVault - custody and per-user capital accounting
/// @notice Funds can only ever flow between the vault and registered strategies on behalf of
///         the executor, or back to the user who owns them. No role can send funds elsewhere.
contract KriyaVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    KriyaMandate public immutable mandate;
    KriyaStrategyRegistry public immutable registry;
    address public executor;

    mapping(address => uint256) public idleOf;
    mapping(address => mapping(address => uint256)) public positionOf;
    mapping(address => uint256) public highWaterMark;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event MovedToStrategy(address indexed user, address indexed strategy, uint256 amount);
    event MovedFromStrategy(address indexed user, address indexed strategy, uint256 amount);
    event EmergencyExit(address indexed user, uint256 recovered);
    event ExecutorSet(address executor);

    error OnlyExecutor();
    error ZeroAmount();
    error InsufficientIdle(uint256 requested, uint256 available);
    error InsufficientPosition(address strategy, uint256 requested, uint256 available);
    error UnknownStrategy(address strategy);

    constructor(IERC20 _asset, KriyaMandate _mandate, KriyaStrategyRegistry _registry) Ownable(msg.sender) {
        asset = _asset;
        mandate = _mandate;
        registry = _registry;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
        emit ExecutorSet(_executor);
    }

    // ------------------------------------------------------------------ user actions

    function deposit(uint256 amount) external nonReentrant {
        _deposit(msg.sender, amount);
    }

    /// @notice Deposit capital and program its objective in a single transaction.
    function openMandate(
        uint256 amount,
        KriyaMandate.Params calldata params,
        address[] calldata allowedStrategies
    ) external nonReentrant {
        mandate.setMandateFor(msg.sender, params, allowedStrategies);
        if (amount > 0) _deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 idle = idleOf[msg.sender];
        if (amount > idle) revert InsufficientIdle(amount, idle);
        idleOf[msg.sender] = idle - amount;
        uint256 hwm = highWaterMark[msg.sender];
        highWaterMark[msg.sender] = hwm > amount ? hwm - amount : 0;
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Human override: pull every position back into the reserve immediately.
    function emergencyExit() external nonReentrant {
        address[] memory list = registry.strategies();
        uint256 recovered;
        for (uint256 i = 0; i < list.length; i++) {
            uint256 pos = positionOf[msg.sender][list[i]];
            if (pos == 0) continue;
            _fromStrategy(msg.sender, list[i], pos);
            recovered += pos;
        }
        emit EmergencyExit(msg.sender, recovered);
    }

    // ------------------------------------------------------------------ executor actions

    function moveToStrategy(address user, address strategy, uint256 amount) external onlyExecutor nonReentrant {
        if (!registry.isStrategy(strategy)) revert UnknownStrategy(strategy);
        uint256 idle = idleOf[user];
        if (amount > idle) revert InsufficientIdle(amount, idle);
        idleOf[user] = idle - amount;
        positionOf[user][strategy] += amount;
        asset.safeTransfer(strategy, amount);
        emit MovedToStrategy(user, strategy, amount);
    }

    function moveFromStrategy(address user, address strategy, uint256 amount) external onlyExecutor nonReentrant {
        _fromStrategy(user, strategy, amount);
    }

    function syncHighWaterMark(address user) external onlyExecutor {
        uint256 value = totalValue(user);
        if (value > highWaterMark[user]) highWaterMark[user] = value;
    }

    // ------------------------------------------------------------------ views

    function totalValue(address user) public view returns (uint256 total) {
        total = idleOf[user];
        address[] memory list = registry.strategies();
        for (uint256 i = 0; i < list.length; i++) {
            total += positionOf[user][list[i]];
        }
    }

    function positionsOf(address user)
        external
        view
        returns (address[] memory strategies, uint256[] memory amounts, uint256 idle, uint256 total)
    {
        strategies = registry.strategies();
        amounts = new uint256[](strategies.length);
        idle = idleOf[user];
        total = idle;
        for (uint256 i = 0; i < strategies.length; i++) {
            amounts[i] = positionOf[user][strategies[i]];
            total += amounts[i];
        }
    }

    // ------------------------------------------------------------------ internal

    function _deposit(address user, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        asset.safeTransferFrom(user, address(this), amount);
        idleOf[user] += amount;
        highWaterMark[user] += amount;
        emit Deposited(user, amount);
    }

    function _fromStrategy(address user, address strategy, uint256 amount) internal {
        uint256 pos = positionOf[user][strategy];
        if (amount > pos) revert InsufficientPosition(strategy, amount, pos);
        positionOf[user][strategy] = pos - amount;
        idleOf[user] += amount;
        IStrategy(strategy).release(amount);
        emit MovedFromStrategy(user, strategy, amount);
    }
}

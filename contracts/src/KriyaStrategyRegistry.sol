// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title KriyaStrategyRegistry - the allowlisted strategy universe and its verified risk scores
/// @notice Risk scores (0-100) are written only by authorized updaters: the KriyaExecutor
///         (relaying Chainlink CRE-verified reports) and, as a fallback, the protocol owner.
contract KriyaStrategyRegistry is Ownable {
    struct Strategy {
        string name;
        uint16 apyBps; // displayed expected yield, e.g. 840 = 8.40%
        uint16 risk; // 0-100, verified risk score
        uint64 updatedAt;
        bool active;
    }

    address[] private s_strategies;
    mapping(address => Strategy) private s_info;
    mapping(address => bool) public isUpdater;

    event StrategyAdded(address indexed strategy, string name, uint16 apyBps, uint16 risk);
    event RiskUpdated(address indexed strategy, uint16 oldRisk, uint16 newRisk, address indexed updater);
    event ApyUpdated(address indexed strategy, uint16 oldApyBps, uint16 newApyBps);
    event UpdaterSet(address indexed updater, bool allowed);

    error NotUpdater();
    error UnknownStrategy(address strategy);
    error AlreadyRegistered(address strategy);
    error InvalidRisk(uint16 risk);
    error LengthMismatch();

    constructor() Ownable(msg.sender) {}

    modifier onlyUpdater() {
        if (!isUpdater[msg.sender] && msg.sender != owner()) revert NotUpdater();
        _;
    }

    function addStrategy(address strategy, string calldata name, uint16 apyBps, uint16 risk) external onlyOwner {
        if (s_info[strategy].active) revert AlreadyRegistered(strategy);
        if (risk > 100) revert InvalidRisk(risk);
        s_strategies.push(strategy);
        s_info[strategy] = Strategy(name, apyBps, risk, uint64(block.timestamp), true);
        emit StrategyAdded(strategy, name, apyBps, risk);
    }

    function setUpdater(address updater, bool allowed) external onlyOwner {
        isUpdater[updater] = allowed;
        emit UpdaterSet(updater, allowed);
    }

    function setRisks(address[] calldata targets, uint16[] calldata risks) external onlyUpdater {
        if (targets.length != risks.length) revert LengthMismatch();
        for (uint256 i = 0; i < targets.length; i++) {
            Strategy storage s = s_info[targets[i]];
            if (!s.active) revert UnknownStrategy(targets[i]);
            if (risks[i] > 100) revert InvalidRisk(risks[i]);
            if (s.risk == risks[i]) continue;
            emit RiskUpdated(targets[i], s.risk, risks[i], msg.sender);
            s.risk = risks[i];
            s.updatedAt = uint64(block.timestamp);
        }
    }

    function setApy(address strategy, uint16 apyBps) external onlyOwner {
        Strategy storage s = s_info[strategy];
        if (!s.active) revert UnknownStrategy(strategy);
        emit ApyUpdated(strategy, s.apyBps, apyBps);
        s.apyBps = apyBps;
    }

    function isStrategy(address strategy) external view returns (bool) {
        return s_info[strategy].active;
    }

    function riskOf(address strategy) external view returns (uint16) {
        Strategy storage s = s_info[strategy];
        if (!s.active) revert UnknownStrategy(strategy);
        return s.risk;
    }

    function getStrategy(address strategy) external view returns (Strategy memory) {
        return s_info[strategy];
    }

    function strategies() external view returns (address[] memory) {
        return s_strategies;
    }

    function getAll() external view returns (address[] memory addrs, Strategy[] memory infos) {
        addrs = s_strategies;
        infos = new Strategy[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            infos[i] = s_info[addrs[i]];
        }
    }
}

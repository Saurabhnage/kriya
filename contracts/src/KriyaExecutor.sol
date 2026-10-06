// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReceiverTemplate} from "./cre/ReceiverTemplate.sol";
import {KriyaMandate} from "./KriyaMandate.sol";
import {KriyaVault} from "./KriyaVault.sol";
import {KriyaStrategyRegistry} from "./KriyaStrategyRegistry.sol";

/// @title KriyaExecutor - the enforcement layer
/// @notice AI proposes. Rules constrain. Verifiable infrastructure verifies. Smart contracts enforce.
///
///         Allocations arrive from two paths and pass the SAME onchain mandate check:
///           1. Chainlink CRE reports delivered by the Keystone forwarder (`onReport`)
///           2. The KRIYA agent key (`executeAllocation`), a bounded fallback path
///         An allocation that violates the user's mandate reverts. The agent cannot move funds
///         anywhere except between the vault and allowlisted strategies.
contract KriyaExecutor is ReceiverTemplate {
    uint8 public constant REPORT_RISK_UPDATE = 1;
    uint8 public constant REPORT_ALLOCATION = 2;
    uint16 public constant RESERVE_RISK = 2;
    uint16 public constant BPS = 10_000;

    enum Source {
        AGENT,
        CRE
    }

    KriyaMandate public immutable mandate;
    KriyaVault public immutable vault;
    KriyaStrategyRegistry public immutable registry;

    address public agent;
    bool public paused;
    uint256 public executionCount;

    struct Health {
        uint256 totalValue;
        uint16 portfolioRisk;
        uint16 maxHeldRisk;
        uint16 maxExposureBps;
        uint16 reserveBps;
        bool allocated;
        bool violated;
    }

    event AllocationExecuted(
        address indexed user,
        uint256 indexed executionId,
        Source source,
        address[] strategies,
        uint16[] bps,
        uint16 reserveBps,
        uint16 portfolioRisk,
        uint256 totalValue,
        string rationale
    );
    event RiskReportApplied(address[] strategies, uint16[] risks);
    event AgentSet(address agent);
    event PausedSet(bool paused);

    error NotAgent();
    error ProtocolPaused();
    error UnknownReportType(uint8 kind);
    error MandateInactive(address user);
    error AutoRebalanceDisabled(address user);
    error NothingToAllocate(address user);
    error LengthMismatch();
    error DuplicateStrategy(address strategy);
    error StrategyNotAllowed(address strategy);
    error ExposureExceeded(address strategy, uint16 bps, uint16 maxBps);
    error StrategyRiskExceeded(address strategy, uint16 risk, uint16 maxRisk);
    error AllocationOverflow(uint256 totalBps);
    error ReserveBelowMinimum(uint16 reserveBps, uint16 minReserveBps);
    error PortfolioRiskExceeded(uint16 risk, uint16 maxRisk);
    error DrawdownExceeded(uint256 value, uint256 floor);

    constructor(address forwarder, KriyaMandate _mandate, KriyaVault _vault, KriyaStrategyRegistry _registry, address _agent)
        ReceiverTemplate(forwarder)
    {
        mandate = _mandate;
        vault = _vault;
        registry = _registry;
        agent = _agent;
        emit AgentSet(_agent);
    }

    // ------------------------------------------------------------------ admin

    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentSet(_agent);
    }

    /// @notice Emergency pause: stops all executions from every path.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    // ------------------------------------------------------------------ entry points

    /// @notice Agent path. Subject to exactly the same mandate validation as CRE reports.
    function executeAllocation(
        address user,
        address[] calldata strategies,
        uint16[] calldata bps,
        string calldata rationale
    ) external {
        if (msg.sender != agent) revert NotAgent();
        _execute(user, strategies, bps, rationale, Source.AGENT);
    }

    /// @notice CRE path. Report = abi.encode(uint8 kind, bytes payload).
    function _processReport(bytes calldata report) internal override {
        (uint8 kind, bytes memory payload) = abi.decode(report, (uint8, bytes));
        if (kind == REPORT_RISK_UPDATE) {
            (address[] memory strategies, uint16[] memory risks) = abi.decode(payload, (address[], uint16[]));
            registry.setRisks(strategies, risks);
            emit RiskReportApplied(strategies, risks);
        } else if (kind == REPORT_ALLOCATION) {
            (address user, address[] memory strategies, uint16[] memory bps, string memory rationale) =
                abi.decode(payload, (address, address[], uint16[], string));
            _execute(user, strategies, bps, rationale, Source.CRE);
        } else {
            revert UnknownReportType(kind);
        }
    }

    // ------------------------------------------------------------------ validation

    /// @notice Reverts with a descriptive custom error if the allocation violates the mandate.
    /// @return portfolioRisk weighted risk of the proposed portfolio (reserve included)
    /// @return reserveBps share left in the USDC reserve
    function validateAllocation(address user, address[] memory strategies, uint16[] memory bps)
        public
        view
        returns (uint16 portfolioRisk, uint16 reserveBps)
    {
        KriyaMandate.Mandate memory m = mandate.getMandate(user);
        if (!m.active) revert MandateInactive(user);
        if (strategies.length != bps.length) revert LengthMismatch();

        uint256 totalBps;
        uint256 weightedRisk;
        for (uint256 i = 0; i < strategies.length; i++) {
            address s = strategies[i];
            for (uint256 j = 0; j < i; j++) {
                if (strategies[j] == s) revert DuplicateStrategy(s);
            }
            if (!registry.isStrategy(s) || !mandate.isAllowed(user, s)) revert StrategyNotAllowed(s);
            if (bps[i] > m.params.maxExposureBps) revert ExposureExceeded(s, bps[i], m.params.maxExposureBps);
            uint16 risk = registry.riskOf(s);
            if (bps[i] > 0 && risk > m.params.maxRisk) revert StrategyRiskExceeded(s, risk, m.params.maxRisk);
            totalBps += bps[i];
            weightedRisk += uint256(bps[i]) * risk;
        }
        if (totalBps > BPS) revert AllocationOverflow(totalBps);
        reserveBps = uint16(BPS - totalBps);
        if (reserveBps < m.params.minReserveBps) revert ReserveBelowMinimum(reserveBps, m.params.minReserveBps);

        weightedRisk += uint256(reserveBps) * RESERVE_RISK;
        portfolioRisk = uint16(weightedRisk / BPS);
        if (portfolioRisk > m.params.maxRisk) revert PortfolioRiskExceeded(portfolioRisk, m.params.maxRisk);
    }

    /// @notice Live mandate health computed from current positions and verified risk scores.
    function mandateHealth(address user) public view returns (Health memory h) {
        KriyaMandate.Mandate memory m = mandate.getMandate(user);
        (address[] memory list, uint256[] memory amounts, uint256 idle, uint256 total) = vault.positionsOf(user);
        h.totalValue = total;
        if (total == 0) return h;

        uint256 weighted = idle * RESERVE_RISK;
        for (uint256 i = 0; i < list.length; i++) {
            if (amounts[i] == 0) continue;
            h.allocated = true;
            uint16 risk = registry.riskOf(list[i]);
            weighted += amounts[i] * risk;
            if (risk > h.maxHeldRisk) h.maxHeldRisk = risk;
            uint16 share = uint16((amounts[i] * BPS) / total);
            if (share > h.maxExposureBps) h.maxExposureBps = share;
            if (risk > m.params.maxRisk) h.violated = true;
            if (!mandate.isAllowed(user, list[i])) h.violated = true;
        }
        h.portfolioRisk = uint16(weighted / total);
        h.reserveBps = uint16((idle * BPS) / total);
        if (h.portfolioRisk > m.params.maxRisk) h.violated = true;
        if (h.maxExposureBps > m.params.maxExposureBps) h.violated = true;
    }

    // ------------------------------------------------------------------ execution

    function _execute(
        address user,
        address[] memory strategies,
        uint16[] memory bps,
        string memory rationale,
        Source source
    ) internal {
        if (paused) revert ProtocolPaused();

        Health memory before = mandateHealth(user);
        if (before.totalValue == 0) revert NothingToAllocate(user);
        if (before.allocated && !mandate.getMandate(user).params.autoRebalance) revert AutoRebalanceDisabled(user);

        (uint16 portfolioRisk, uint16 reserveBps) = validateAllocation(user, strategies, bps);
        _checkDrawdown(user, before.totalValue);

        _rebalance(user, strategies, bps, before.totalValue);
        vault.syncHighWaterMark(user);

        uint256 id = ++executionCount;
        emit AllocationExecuted(user, id, source, strategies, bps, reserveBps, portfolioRisk, before.totalValue, rationale);
    }

    function _checkDrawdown(address user, uint256 value) internal view {
        uint16 maxDd = mandate.getMandate(user).params.maxDrawdownBps;
        uint256 floor = (vault.highWaterMark(user) * (BPS - maxDd)) / BPS;
        if (value < floor) revert DrawdownExceeded(value, floor);
    }

    /// @dev Delta-based: first shrink over-weight positions into the reserve, then grow under-weight ones.
    function _rebalance(address user, address[] memory strategies, uint16[] memory bps, uint256 total) internal {
        address[] memory list = registry.strategies();
        uint256[] memory targets = new uint256[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            for (uint256 j = 0; j < strategies.length; j++) {
                if (strategies[j] == list[i]) {
                    targets[i] = (total * bps[j]) / BPS;
                    break;
                }
            }
        }
        for (uint256 i = 0; i < list.length; i++) {
            uint256 pos = vault.positionOf(user, list[i]);
            if (pos > targets[i]) vault.moveFromStrategy(user, list[i], pos - targets[i]);
        }
        for (uint256 i = 0; i < list.length; i++) {
            uint256 pos = vault.positionOf(user, list[i]);
            if (pos < targets[i]) vault.moveToStrategy(user, list[i], targets[i] - pos);
        }
    }
}

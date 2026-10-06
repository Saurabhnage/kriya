// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStrategy} from "../src/mocks/MockStrategy.sol";
import {KriyaStrategyRegistry} from "../src/KriyaStrategyRegistry.sol";
import {KriyaMandate} from "../src/KriyaMandate.sol";
import {KriyaVault} from "../src/KriyaVault.sol";
import {KriyaExecutor} from "../src/KriyaExecutor.sol";
import {ReceiverTemplate} from "../src/cre/ReceiverTemplate.sol";

contract KriyaTest is Test {
    MockUSDC usdc;
    KriyaStrategyRegistry registry;
    KriyaMandate mandate;
    KriyaVault vault;
    KriyaExecutor executor;
    address stratA;
    address stratB;
    address stratC;

    address forwarder = makeAddr("forwarder");
    address agent = makeAddr("agent");
    address user = makeAddr("user");

    uint256 constant CAPITAL = 1_000e6;

    function setUp() public {
        usdc = new MockUSDC();
        registry = new KriyaStrategyRegistry();
        mandate = new KriyaMandate();
        vault = new KriyaVault(IERC20(address(usdc)), mandate, registry);
        executor = new KriyaExecutor(forwarder, mandate, vault, registry, agent);
        mandate.setVault(address(vault));
        vault.setExecutor(address(executor));
        registry.setUpdater(address(executor), true);

        stratA = address(new MockStrategy(IERC20(address(usdc)), address(vault), "Strategy A"));
        stratB = address(new MockStrategy(IERC20(address(usdc)), address(vault), "Strategy B"));
        stratC = address(new MockStrategy(IERC20(address(usdc)), address(vault), "Strategy C"));
        registry.addStrategy(stratA, "Strategy A", 840, 21);
        registry.addStrategy(stratB, "Strategy B", 1120, 34);
        registry.addStrategy(stratC, "Strategy C", 680, 15);

        usdc.faucet(user, CAPITAL);
        vm.startPrank(user);
        usdc.approve(address(vault), CAPITAL);
        vault.openMandate(CAPITAL, _demoParams(), _all());
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ helpers

    function _demoParams() internal pure returns (KriyaMandate.Params memory) {
        return KriyaMandate.Params({
            maxRisk: 40,
            maxExposureBps: 4000,
            maxDrawdownBps: 500,
            minReserveBps: 2500,
            autoRebalance: true,
            objective: "Maximize risk-adjusted yield"
        });
    }

    function _all() internal view returns (address[] memory s) {
        s = new address[](3);
        s[0] = stratA;
        s[1] = stratB;
        s[2] = stratC;
    }

    function _alloc(address a, uint16 ba, address b, uint16 bb)
        internal
        pure
        returns (address[] memory s, uint16[] memory w)
    {
        s = new address[](2);
        w = new uint16[](2);
        (s[0], w[0], s[1], w[1]) = (a, ba, b, bb);
    }

    function _initialAllocation() internal {
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 3500, stratB, 4000);
        vm.prank(agent);
        executor.executeAllocation(user, s, w, "initial");
    }

    function _report(uint8 kind, bytes memory payload) internal {
        vm.prank(forwarder);
        executor.onReport("", abi.encode(kind, payload));
    }

    // ------------------------------------------------------------------ mandate + deposit

    function test_OpenMandateDepositsAndStoresParams() public view {
        assertEq(vault.idleOf(user), CAPITAL);
        assertEq(vault.highWaterMark(user), CAPITAL);
        KriyaMandate.Mandate memory m = mandate.getMandate(user);
        assertTrue(m.active);
        assertEq(m.params.maxRisk, 40);
        assertEq(m.allowedStrategies.length, 3);
        assertEq(mandate.users().length, 1);
    }

    // ------------------------------------------------------------------ valid allocation executes

    function test_AgentValidAllocationExecutes() public {
        _initialAllocation();
        assertEq(vault.positionOf(user, stratA), 350e6);
        assertEq(vault.positionOf(user, stratB), 400e6);
        assertEq(vault.idleOf(user), 250e6);
        assertEq(usdc.balanceOf(stratB), 400e6);

        KriyaExecutor.Health memory h = executor.mandateHealth(user);
        assertFalse(h.violated);
        assertEq(h.portfolioRisk, 21); // (35*21 + 40*34 + 25*2) / 100 = 21.45
        assertEq(h.reserveBps, 2500);
        assertEq(executor.executionCount(), 1);
    }

    // ------------------------------------------------------------------ invalid allocations revert

    function test_RevertWhen_ExposureExceeded() public {
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 1500, stratB, 6000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.ExposureExceeded.selector, stratB, 6000, 4000));
        executor.executeAllocation(user, s, w, "too much B");
    }

    function test_RevertWhen_ReserveBelowMinimum() public {
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 4000, stratB, 4000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.ReserveBelowMinimum.selector, 2000, 2500));
        executor.executeAllocation(user, s, w, "no reserve");
    }

    function test_RevertWhen_StrategyRiskAboveMandate() public {
        address[] memory s = new address[](1);
        uint16[] memory r = new uint16[](1);
        (s[0], r[0]) = (stratB, 48);
        registry.setRisks(s, r);

        (address[] memory a, uint16[] memory w) = _alloc(stratA, 3500, stratB, 2000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.StrategyRiskExceeded.selector, stratB, 48, 40));
        executor.executeAllocation(user, a, w, "still holds B");
    }

    function test_RevertWhen_StrategyNotAllowedByMandate() public {
        address[] memory onlyA = new address[](1);
        onlyA[0] = stratA;
        vm.prank(user);
        mandate.setMandate(_demoParams(), onlyA);

        (address[] memory s, uint16[] memory w) = _alloc(stratA, 3500, stratC, 3000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.StrategyNotAllowed.selector, stratC));
        executor.executeAllocation(user, s, w, "C not allowed");
    }

    function test_RevertWhen_DuplicateStrategy() public {
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 2000, stratA, 2000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.DuplicateStrategy.selector, stratA));
        executor.executeAllocation(user, s, w, "dup");
    }

    function test_RevertWhen_CallerIsNotAgent() public {
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 3500, stratB, 4000);
        vm.expectRevert(KriyaExecutor.NotAgent.selector);
        executor.executeAllocation(user, s, w, "attacker");
    }

    function test_RevertWhen_MandatePausedByUser() public {
        vm.prank(user);
        mandate.setActive(false);
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 3500, stratB, 4000);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.MandateInactive.selector, user));
        executor.executeAllocation(user, s, w, "paused");
    }

    function test_RevertWhen_ProtocolPaused() public {
        executor.setPaused(true);
        (address[] memory s, uint16[] memory w) = _alloc(stratA, 3500, stratB, 4000);
        vm.prank(agent);
        vm.expectRevert(KriyaExecutor.ProtocolPaused.selector);
        executor.executeAllocation(user, s, w, "paused");
    }

    function test_RevertWhen_AutoRebalanceDisabled() public {
        _initialAllocation();
        KriyaMandate.Params memory p = _demoParams();
        p.autoRebalance = false;
        vm.prank(user);
        mandate.setMandate(p, _all());

        (address[] memory s, uint16[] memory w) = _alloc(stratA, 4000, stratC, 3500);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.AutoRebalanceDisabled.selector, user));
        executor.executeAllocation(user, s, w, "rebalance");
    }

    // ------------------------------------------------------------------ CRE path

    function test_CreRiskReportThenRebalanceRestoresMandate() public {
        _initialAllocation();

        // CRE verifies the external risk change and writes it onchain
        address[] memory s = new address[](1);
        uint16[] memory r = new uint16[](1);
        (s[0], r[0]) = (stratB, 48);
        _report(1, abi.encode(s, r));
        assertEq(registry.riskOf(stratB), 48);
        assertTrue(executor.mandateHealth(user).violated, "mandate should be at risk");

        // CRE delivers the verified rebalance
        (address[] memory a, uint16[] memory w) = _alloc(stratA, 4000, stratC, 3500);
        _report(2, abi.encode(user, a, w, "exit B: risk 34 -> 48 exceeds mandate max 40"));

        assertEq(vault.positionOf(user, stratB), 0);
        assertEq(vault.positionOf(user, stratA), 400e6);
        assertEq(vault.positionOf(user, stratC), 350e6);
        assertEq(vault.idleOf(user), 250e6);
        assertEq(usdc.balanceOf(stratB), 0);

        KriyaExecutor.Health memory h = executor.mandateHealth(user);
        assertFalse(h.violated);
        assertEq(h.portfolioRisk, 14); // (40*21 + 35*15 + 25*2) / 100 = 14.15
        assertEq(executor.executionCount(), 2);
    }

    function test_CreAllocationIsStillMandateChecked() public {
        (address[] memory a, uint16[] memory w) = _alloc(stratA, 3500, stratB, 5000);
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(KriyaExecutor.ExposureExceeded.selector, stratB, 5000, 4000));
        executor.onReport("", abi.encode(uint8(2), abi.encode(user, a, w, "bad")));
    }

    function test_RevertWhen_ReportNotFromForwarder() public {
        (address[] memory a, uint16[] memory w) = _alloc(stratA, 3500, stratB, 4000);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), forwarder));
        executor.onReport("", abi.encode(uint8(2), abi.encode(user, a, w, "spoof")));
    }

    function test_RevertWhen_RiskUpdateFromStranger() public {
        address[] memory s = new address[](1);
        uint16[] memory r = new uint16[](1);
        (s[0], r[0]) = (stratB, 1);
        vm.prank(agent);
        vm.expectRevert(KriyaStrategyRegistry.NotUpdater.selector);
        registry.setRisks(s, r);
    }

    // ------------------------------------------------------------------ custody

    function test_AgentCannotMoveFundsDirectly() public {
        vm.prank(agent);
        vm.expectRevert(KriyaVault.OnlyExecutor.selector);
        vault.moveToStrategy(user, stratA, 1);
    }

    function test_EmergencyExitAndWithdraw() public {
        _initialAllocation();
        vm.startPrank(user);
        vault.emergencyExit();
        assertEq(vault.idleOf(user), CAPITAL);
        vault.withdraw(CAPITAL);
        vm.stopPrank();
        assertEq(usdc.balanceOf(user), CAPITAL);
        assertEq(vault.totalValue(user), 0);
    }
}

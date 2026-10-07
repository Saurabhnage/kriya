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

/// @notice Property tests: whatever the agent proposes, funds are conserved and an executed
///         allocation always leaves the mandate compliant.
contract KriyaFuzzTest is Test {
    MockUSDC usdc;
    KriyaStrategyRegistry registry;
    KriyaMandate mandate;
    KriyaVault vault;
    KriyaExecutor executor;
    address[3] strats;

    address agent = makeAddr("agent");
    address user = makeAddr("user");
    uint256 constant CAPITAL = 1_000e6;

    function setUp() public {
        usdc = new MockUSDC();
        registry = new KriyaStrategyRegistry();
        mandate = new KriyaMandate();
        vault = new KriyaVault(IERC20(address(usdc)), mandate, registry);
        executor = new KriyaExecutor(makeAddr("forwarder"), mandate, vault, registry, agent);
        mandate.setVault(address(vault));
        vault.setExecutor(address(executor));
        registry.setUpdater(address(executor), true);

        uint16[3] memory risks = [uint16(21), 34, 15];
        for (uint256 i = 0; i < 3; i++) {
            strats[i] = address(new MockStrategy(IERC20(address(usdc)), address(vault), "S"));
            registry.addStrategy(strats[i], "S", 800, risks[i]);
        }

        usdc.faucet(user, CAPITAL);
        vm.startPrank(user);
        usdc.approve(address(vault), CAPITAL);
        address[] memory allowed = new address[](3);
        (allowed[0], allowed[1], allowed[2]) = (strats[0], strats[1], strats[2]);
        vault.openMandate(
            CAPITAL,
            KriyaMandate.Params({maxRisk: 40, maxExposureBps: 4000, maxDrawdownBps: 500, minReserveBps: 2500, autoRebalance: true, objective: "fuzz"}),
            allowed
        );
        vm.stopPrank();
    }

    function _alloc(uint16 a, uint16 b, uint16 c) internal view returns (address[] memory s, uint16[] memory w) {
        s = new address[](3);
        w = new uint16[](3);
        (s[0], s[1], s[2]) = (strats[0], strats[1], strats[2]);
        (w[0], w[1], w[2]) = (a, b, c);
    }

    function _totalHeld() internal view returns (uint256 t) {
        t = usdc.balanceOf(address(vault));
        for (uint256 i = 0; i < 3; i++) t += usdc.balanceOf(strats[i]);
    }

    /// @dev Either the executor rejects the proposal, or it executes and every invariant holds.
    function _tryExecute(uint16 a, uint16 b, uint16 c) internal returns (bool executed) {
        (address[] memory s, uint16[] memory w) = _alloc(a, b, c);
        vm.prank(agent);
        try executor.executeAllocation(user, s, w, "fuzz") {
            executed = true;
        } catch {
            executed = false;
        }
    }

    function _assertInvariants() internal view {
        assertEq(_totalHeld(), CAPITAL, "USDC created or destroyed");
        assertEq(vault.totalValue(user), CAPITAL, "user accounting drifted");
        uint256 positions;
        for (uint256 i = 0; i < 3; i++) {
            uint256 p = vault.positionOf(user, strats[i]);
            assertEq(p, usdc.balanceOf(strats[i]), "position != strategy balance");
            positions += p;
        }
        assertEq(positions + vault.idleOf(user), CAPITAL, "positions + idle != capital");
    }

    function testFuzz_ProposalsConserveFundsAndRespectMandate(uint16 a, uint16 b, uint16 c) public {
        a = uint16(bound(a, 0, 6000));
        b = uint16(bound(b, 0, 6000));
        c = uint16(bound(c, 0, 6000));
        bool ok = _tryExecute(a, b, c);
        _assertInvariants();
        if (ok) {
            KriyaExecutor.Health memory h = executor.mandateHealth(user);
            assertFalse(h.violated, "executed allocation left mandate violated");
            assertLe(a, 4000);
            assertLe(b, 4000);
            assertLe(c, 4000);
            assertLe(uint256(a) + b + c, 7500, "reserve below minimum");
        }
    }

    function testFuzz_ValidatorMatchesExecution(uint16 a, uint16 b, uint16 c) public {
        a = uint16(bound(a, 0, 5000));
        b = uint16(bound(b, 0, 5000));
        c = uint16(bound(c, 0, 5000));
        (address[] memory s, uint16[] memory w) = _alloc(a, b, c);
        bool valid;
        try executor.validateAllocation(user, s, w) {
            valid = true;
        } catch {}
        assertEq(_tryExecute(a, b, c), valid, "validateAllocation disagrees with execution");
    }

    function testFuzz_RebalanceSequencesConserveFunds(uint16[6] memory w) public {
        for (uint256 i = 0; i < 6; i += 3) {
            _tryExecute(uint16(bound(w[i], 0, 4000)), uint16(bound(w[i + 1], 0, 4000)), uint16(bound(w[i + 2], 0, 4000)));
            _assertInvariants();
        }
    }

    function testFuzz_RiskSpikeAlwaysBlocksHoldingTheStrategy(uint16 newRisk, uint16 bpsB) public {
        newRisk = uint16(bound(newRisk, 41, 100));
        bpsB = uint16(bound(bpsB, 1, 4000));
        address[] memory s = new address[](1);
        uint16[] memory r = new uint16[](1);
        (s[0], r[0]) = (strats[1], newRisk);
        registry.setRisks(s, r);
        assertFalse(_tryExecute(0, bpsB, 0), "held a strategy above max risk");
        _assertInvariants();
    }
}

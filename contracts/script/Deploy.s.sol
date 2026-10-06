// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStrategy} from "../src/mocks/MockStrategy.sol";
import {KriyaStrategyRegistry} from "../src/KriyaStrategyRegistry.sol";
import {KriyaMandate} from "../src/KriyaMandate.sol";
import {KriyaVault} from "../src/KriyaVault.sol";
import {KriyaExecutor} from "../src/KriyaExecutor.sol";

/// @notice Deploys the full KRIYA protocol plus the controlled demo strategy universe.
/// Env:
///   PRIVATE_KEY      deployer / protocol owner
///   AGENT_ADDRESS    KRIYA agent signer (fallback execution path)
///   CRE_FORWARDER    Chainlink forwarder (defaults to the Sepolia MockKeystoneForwarder used by `cre workflow simulate --broadcast`)
contract Deploy is Script {
    address constant SEPOLIA_MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address agent = vm.envOr("AGENT_ADDRESS", deployer);
        address forwarder = vm.envOr("CRE_FORWARDER", SEPOLIA_MOCK_FORWARDER);

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        KriyaStrategyRegistry registry = new KriyaStrategyRegistry();
        KriyaMandate mandate = new KriyaMandate();
        KriyaVault vault = new KriyaVault(IERC20(address(usdc)), mandate, registry);
        KriyaExecutor executor = new KriyaExecutor(forwarder, mandate, vault, registry, agent);

        mandate.setVault(address(vault));
        vault.setExecutor(address(executor));
        registry.setUpdater(address(executor), true);

        address a = address(new MockStrategy(IERC20(address(usdc)), address(vault), "Strategy A"));
        address b = address(new MockStrategy(IERC20(address(usdc)), address(vault), "Strategy B"));
        address c = address(new MockStrategy(IERC20(address(usdc)), address(vault), "Strategy C"));
        registry.addStrategy(a, "Strategy A - Stable Lending", 840, 21);
        registry.addStrategy(b, "Strategy B - LP Yield", 1120, 34);
        registry.addStrategy(c, "Strategy C - T-Bill Vault", 680, 15);

        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeAddress(o, "usdc", address(usdc));
        vm.serializeAddress(o, "registry", address(registry));
        vm.serializeAddress(o, "mandate", address(mandate));
        vm.serializeAddress(o, "vault", address(vault));
        vm.serializeAddress(o, "executor", address(executor));
        vm.serializeAddress(o, "forwarder", forwarder);
        vm.serializeAddress(o, "agent", agent);
        vm.serializeAddress(o, "strategyA", a);
        vm.serializeAddress(o, "strategyB", b);
        string memory json = vm.serializeAddress(o, "strategyC", c);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment written to", path);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Script, console} from "forge-std/Script.sol";
import {MagneeDelegateAccount} from "../src/MagneeDelegateAccount.sol";

/// @title Deploy7702Delegate
/// @notice Deployment script for MagneeDelegateAccount on mainnet chains
/// @dev Usage:
///   Base:     forge script script/Deploy7702Delegate.s.sol --rpc-url $BASE_RPC --broadcast --verify
///   Arbitrum: forge script script/Deploy7702Delegate.s.sol --rpc-url $ARB_RPC --broadcast --verify

contract Deploy7702Delegate is Script {
    function run() external {
        // Using Foundry keystore via --account flag (no private key in code/env)
        vm.startBroadcast();

        MagneeDelegateAccount delegate = new MagneeDelegateAccount();
        
        console.log("===========================================");
        console.log("MagneeDelegateAccount deployed to:", address(delegate));
        console.log("Chain ID:", block.chainid);
        console.log("===========================================");

        vm.stopBroadcast();
    }
}

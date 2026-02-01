// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PayableDemo} from "../src/PayableDemo.sol";

contract DeployDemo is Script {
    function run() external {
        // Use the account provided by --account or --private-key flag
        vm.startBroadcast();

        // Deploy PayableDemo
        PayableDemo demo = new PayableDemo();

        // Log the address
        console.log("PayableDemo deployed at:", address(demo));

        vm.stopBroadcast();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "forge-std/Script.sol";
import "../src/MagneeRouter.sol";
import "../src/PayableDemo.sol";
import "../src/MockUSDC.sol";

contract DeployAllScript is Script {
    function run()
        external
        returns (MagneeRouter router, PayableDemo demo, MockUSDC usdc)
    {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(
                0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
            )
        );

        vm.startBroadcast(deployerPrivateKey);

        router = new MagneeRouter();
        demo = new PayableDemo();
        usdc = new MockUSDC();

        console.log("MagneeRouter deployed at:", address(router));
        console.log("PayableDemo deployed at:", address(demo));
        console.log("MockUSDC deployed at:", address(usdc));

        vm.stopBroadcast();
    }
}

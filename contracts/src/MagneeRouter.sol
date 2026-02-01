// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMockERC20 {
    function mint(address to, uint256 amount) external;
}

/// @title MagneeRouter - Draft passthrough router for testing
/// @notice Minimal router that forwards ETH calls to target contracts
/// @dev This is a spike/draft - not production ready
contract MagneeRouter {
    /// @notice Emitted when a call is forwarded through the router
    event MagneeCall(
        address indexed sender,
        address indexed target,
        uint256 value,
        bytes data
    );

    event MagneeSwap(
        address indexed sender,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Forward a payable call to a target contract
    function forward(
        address target,
        bytes calldata data
    ) external payable returns (bytes memory returnData) {
        emit MagneeCall(msg.sender, target, msg.value, data);

        (bool success, bytes memory result) = target.call{value: msg.value}(
            data
        );

        if (!success) {
            if (result.length > 0) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            revert("MagneeRouter: call failed");
        }

        return result;
    }

    /// @notice Execute a generic route (Pay for Action A with Token X)
    /// @param tokenIn The token the user is paying with (address(0) for ETH)
    /// @param amountIn The amount the user is paying
    /// @param target The final destination contract (e.g. the Shop)
    /// @param targetData The calldata to execute on the target (e.g. buyItem())
    /// @param auxData Strategy-specific data (e.g. tokenOut, minAmountOut)
    function executeRoute(
        address tokenIn,
        uint256 amountIn,
        address target,
        bytes calldata targetData,
        bytes calldata auxData
    ) external payable {
        // 1. STRATEGY EXECUTION (Mock)
        // In a real router, this would swap tokenIn -> requiredToken

        uint256 valueToForward = msg.value;

        // Mock Strategy A: Pay with ETH (Direct Forwarding)
        if (tokenIn == address(0)) {
            // No swap needed, just forward the ETH we received
            // If auxData contains "Swap to USDC" logic, we would do that here,
            // but that would usually imply the *target* wants USDC.

            // For the "Swap to USDC" button we had before, that was a "Buy USDC" action.
            // If the user is intercepting a payment, they usually want to deliver value to the target.

            // Let's keep the Mock "Mint USDC" side-effect if requested via auxData for testing?
            // "Pay with ETH, but also get some free MockUSDC because why not?" (Mock incentive)
            if (auxData.length >= 32) {
                address tokenOut = abi.decode(auxData, (address));
                // Mock Minting (Simulating a complex DeFi route where you might get a rebate?)
                // Or just simulating the "Swap" button behavior but now it ALSO forwards.
                // let's assume 1 ETH = 3000 USDC mock rate
                uint256 amountOut = (msg.value * 3000) / 1e12;
                try IMockERC20(tokenOut).mint(msg.sender, amountOut) {} catch {}
            }
        }

        // 2. FORWARDING
        if (target != address(0)) {
            (bool success, bytes memory result) = target.call{
                value: valueToForward
            }(targetData);

            if (!success) {
                if (result.length > 0) {
                    assembly {
                        revert(add(result, 32), mload(result))
                    }
                }
                revert("MagneeRouter: forward failed");
            }
        }
    }

    /// @notice Allow receiving ETH directly (for testing)
    receive() external payable {}
}

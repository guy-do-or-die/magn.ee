// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    /// @notice Forward a payable call to a target contract
    /// @param target The target contract address
    /// @param data The calldata to forward
    /// @return returnData The return data from the target call
    function forward(
        address target,
        bytes calldata data
    ) external payable returns (bytes memory returnData) {
        emit MagneeCall(msg.sender, target, msg.value, data);

        (bool success, bytes memory result) = target.call{value: msg.value}(
            data
        );

        if (!success) {
            // Bubble up revert reason
            if (result.length > 0) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            revert("MagneeRouter: call failed");
        }

        return result;
    }

    /// @notice Allow receiving ETH directly (for testing)
    receive() external payable {}
}

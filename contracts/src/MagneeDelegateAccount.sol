// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title MagneeDelegateAccount
/// @author Magnee
/// @notice Delegate contract for EIP-7702 enabled EOAs
/// @dev Deployed once per chain. EOAs delegate to this contract to enable
///      batched transactions while preserving msg.sender as the user's address.
///
/// How it works:
/// 1. User signs EIP-7702 authorization pointing to this contract
/// 2. User sends type 0x04 transaction calling execute() on their own address
/// 3. This contract's code runs in context of user's EOA
/// 4. All target.call() have msg.sender = user's EOA (not this contract!)
///
/// This solves the cross-chain msg.sender problem for Magnee.

contract MagneeDelegateAccount {
    /// @notice Call struct for batched execution
    struct Call {
        address target;   // Contract to call
        uint256 value;    // ETH to send
        bytes data;       // Calldata
    }

    /// @notice Emitted when batch execution completes
    event Executed(address indexed account, uint256 callCount);

    /// @notice Execute a batch of calls atomically
    /// @dev All calls MUST succeed or entire batch reverts
    /// @param calls Array of calls to execute
    function execute(Call[] calldata calls) external payable {
        uint256 len = calls.length;
        
        for (uint256 i = 0; i < len; ) {
            Call calldata c = calls[i];
            
            (bool success, bytes memory result) = c.target.call{value: c.value}(c.data);
            
            if (!success) {
                // Bubble up revert reason
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            
            unchecked { ++i; }
        }

        emit Executed(msg.sender, len);

        // Return any remaining ETH to caller (the EOA)
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool sent, ) = payable(msg.sender).call{value: remaining}("");
            require(sent, "ETH return failed");
        }
    }

    /// @notice Execute a single call (gas optimized for simple cases)
    /// @param target Contract to call
    /// @param value ETH to send
    /// @param data Calldata
    /// @return result The return data from the call
    function executeSingle(
        address target, 
        uint256 value, 
        bytes calldata data
    ) external payable returns (bytes memory result) {
        bool success;
        (success, result) = target.call{value: value}(data);
        
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }

        emit Executed(msg.sender, 1);

        // Return remaining ETH
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool sent, ) = payable(msg.sender).call{value: remaining}("");
            require(sent, "ETH return failed");
        }
    }

    /// @notice Receive ETH (for bridging scenarios)
    receive() external payable {}

    /// @notice Fallback for unknown function calls
    fallback() external payable {}
}

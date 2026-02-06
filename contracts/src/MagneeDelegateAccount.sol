// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title MagneeDelegateAccount
/// @author Magnee
/// @notice Delegate contract for EIP-7702 enabled EOAs — with access control
/// @dev Deployed once per chain. EOAs delegate to this contract to enable
///      batched transactions while preserving msg.sender as the user's address.
///
/// Security model:
///   - execute() / executeSingle(): Only callable by the EOA itself (msg.sender == address(this))
///   - executeWithSignature(): Anyone can call, but requires a valid EIP-712 signature
///     from the EOA owner. Used for cross-chain execution via Li.Fi where the caller
///     is a bridge executor, not the EOA.

contract MagneeDelegateAccount {
    // ── Types ──────────────────────────────────────────────────────────────

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    // ── Events ─────────────────────────────────────────────────────────────

    event Executed(address indexed target, uint256 value, bool success);

    // ── Errors ─────────────────────────────────────────────────────────────

    error Unauthorized();
    error ExpiredDeadline();
    error InvalidSignature();
    error NonceAlreadyUsed();

    // ── Storage ────────────────────────────────────────────────────────────

    /// @notice Tracks used nonces per EOA to prevent replay attacks
    /// @dev Uses mapping(uint256 => bool) for simplicity. In EIP-7702 context,
    ///      address(this) is the EOA, so each EOA has its own storage.
    mapping(uint256 => bool) public usedNonces;

    // ── EIP-712 Constants ──────────────────────────────────────────────────

    bytes32 private constant EXECUTE_TYPEHASH = keccak256(
        "Execute(address target,uint256 value,bytes data,uint256 nonce,uint256 deadline)"
    );

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 private constant NAME_HASH = keccak256("MagneeDelegateAccount");
    bytes32 private constant VERSION_HASH = keccak256("1");

    // ── Self-Call Functions (Same-Chain) ────────────────────────────────────

    /// @notice Execute a batch of calls atomically
    /// @dev Only callable by the EOA itself (same-chain batching via wallet_sendCalls)
    function execute(Call[] calldata calls) external payable {
        if (msg.sender != address(this)) revert Unauthorized();

        uint256 len = calls.length;
        for (uint256 i = 0; i < len; ) {
            _execute(calls[i].target, calls[i].value, calls[i].data);
            unchecked { ++i; }
        }
    }

    /// @notice Execute a single call (gas optimized)
    /// @dev Only callable by the EOA itself
    function executeSingle(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory result) {
        if (msg.sender != address(this)) revert Unauthorized();
        result = _execute(target, value, data);
    }

    // ── Signature-Verified Function (Cross-Chain) ──────────────────────────

    /// @notice Execute a single call with EIP-712 signature verification
    /// @dev Used by Li.Fi executors on destination chain. The signature proves
    ///      the EOA owner authorized this specific execution.
    /// @param target Contract to call
    /// @param value ETH to send
    /// @param data Calldata for the target
    /// @param nonce Unique nonce to prevent replay
    /// @param deadline Timestamp after which the signature expires
    /// @param signature EIP-712 signature from the EOA owner (65 bytes: r + s + v)
    function executeWithSignature(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable returns (bytes memory result) {
        // Check deadline
        if (block.timestamp > deadline) revert ExpiredDeadline();

        // Check nonce not reused
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        usedNonces[nonce] = true;

        // Build EIP-712 digest
        bytes32 structHash = keccak256(
            abi.encode(EXECUTE_TYPEHASH, target, value, keccak256(data), nonce, deadline)
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(), structHash)
        );

        // Recover signer
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            // signature is a calldata slice, so use calldataload
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // Normalize v
        if (v < 27) v += 27;

        address signer = ecrecover(digest, v, r, s);

        // Signer must be the EOA (address(this) in EIP-7702 context)
        if (signer != address(this) || signer == address(0)) revert InvalidSignature();

        // Execute
        result = _execute(target, value, data);
    }

    // ── Receive/Fallback ───────────────────────────────────────────────────

    /// @notice Receive ETH (for bridging scenarios)
    receive() external payable {}

    /// @notice Fallback for unknown function calls
    fallback() external payable {}

    // ── Internal ───────────────────────────────────────────────────────────

    function _execute(
        address target,
        uint256 value,
        bytes calldata data
    ) internal returns (bytes memory result) {
        bool success;
        (success, result) = target.call{value: value}(data);

        emit Executed(target, value, success);

        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }
}

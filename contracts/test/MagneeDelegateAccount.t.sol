// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import "forge-std/Test.sol";
import "../src/MagneeDelegateAccount.sol";

/// @title MagneeDelegateAccount Security Tests
/// @notice Tests access control, signature verification, replay protection
contract MagneeDelegateAccountTest is Test {
    MagneeDelegateAccount delegate;

    // Test user (simulates delegated EOA)
    uint256 constant USER_PK = 0xA11CE;
    address user;

    // Target contract (receives calls)
    address target = address(0xBEEF);

    // Attacker
    address attacker = address(0xDEAD);

    // EIP-712 constants (must match contract)
    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant EXECUTE_TYPEHASH =
        keccak256("Execute(address target,uint256 value,bytes data,uint256 nonce,uint256 deadline)");
    bytes32 constant NAME_HASH = keccak256("MagneeDelegateAccount");
    bytes32 constant VERSION_HASH = keccak256("1");

    function setUp() public {
        user = vm.addr(USER_PK);
        delegate = new MagneeDelegateAccount();

        // Fund the "delegated EOA" (in real 7702, address(this) would be the EOA)
        vm.deal(address(delegate), 10 ether);
        vm.deal(user, 10 ether);
    }

    // ── execute() Access Control ───────────────────────────────────────────

    function test_execute_reverts_when_called_by_non_self() public {
        MagneeDelegateAccount.Call[] memory calls = new MagneeDelegateAccount.Call[](1);
        calls[0] = MagneeDelegateAccount.Call(target, 0, "");

        vm.prank(attacker);
        vm.expectRevert(MagneeDelegateAccount.Unauthorized.selector);
        delegate.execute(calls);
    }

    function test_execute_succeeds_when_called_by_self() public {
        MagneeDelegateAccount.Call[] memory calls = new MagneeDelegateAccount.Call[](1);
        calls[0] = MagneeDelegateAccount.Call(target, 0, "");

        // Simulate self-call (msg.sender == address(delegate))
        vm.prank(address(delegate));
        delegate.execute(calls);
    }

    // ── executeSingle() Access Control ─────────────────────────────────────

    function test_executeSingle_reverts_when_called_by_non_self() public {
        vm.prank(attacker);
        vm.expectRevert(MagneeDelegateAccount.Unauthorized.selector);
        delegate.executeSingle(target, 0, "");
    }

    function test_executeSingle_succeeds_when_called_by_self() public {
        vm.prank(address(delegate));
        delegate.executeSingle(target, 0, "");
    }

    // ── executeWithSignature() ─────────────────────────────────────────────

    function test_executeWithSignature_valid_signature() public {
        // For this test, we need address(this) in the contract context to equal `user`.
        // We deploy delegate at the user's address using vm.etch
        vm.etch(user, address(delegate).code);
        MagneeDelegateAccount userDelegate = MagneeDelegateAccount(payable(user));

        uint256 nonce = 1;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory callData = "";

        bytes memory sig = _sign(USER_PK, user, target, 0, callData, nonce, deadline);

        // Anyone can call executeWithSignature if they have a valid sig
        vm.prank(attacker);
        userDelegate.executeWithSignature(target, 0, callData, nonce, deadline, sig);
    }

    function test_executeWithSignature_wrong_signer_reverts() public {
        vm.etch(user, address(delegate).code);
        MagneeDelegateAccount userDelegate = MagneeDelegateAccount(payable(user));

        uint256 nonce = 1;
        uint256 deadline = block.timestamp + 1 hours;

        // Sign with a different key
        uint256 wrongPK = 0xB0B;
        bytes memory sig = _sign(wrongPK, user, target, 0, "", nonce, deadline);

        vm.prank(attacker);
        vm.expectRevert(MagneeDelegateAccount.InvalidSignature.selector);
        userDelegate.executeWithSignature(target, 0, "", nonce, deadline, sig);
    }

    function test_executeWithSignature_expired_deadline_reverts() public {
        vm.etch(user, address(delegate).code);
        MagneeDelegateAccount userDelegate = MagneeDelegateAccount(payable(user));

        uint256 nonce = 1;
        uint256 deadline = block.timestamp - 1; // Already expired

        bytes memory sig = _sign(USER_PK, user, target, 0, "", nonce, deadline);

        vm.prank(attacker);
        vm.expectRevert(MagneeDelegateAccount.ExpiredDeadline.selector);
        userDelegate.executeWithSignature(target, 0, "", nonce, deadline, sig);
    }

    function test_executeWithSignature_replay_reverts() public {
        vm.etch(user, address(delegate).code);
        MagneeDelegateAccount userDelegate = MagneeDelegateAccount(payable(user));

        uint256 nonce = 42;
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sig = _sign(USER_PK, user, target, 0, "", nonce, deadline);

        // First call succeeds
        vm.prank(attacker);
        userDelegate.executeWithSignature(target, 0, "", nonce, deadline, sig);

        // Same nonce again → reverts
        vm.prank(attacker);
        vm.expectRevert(MagneeDelegateAccount.NonceAlreadyUsed.selector);
        userDelegate.executeWithSignature(target, 0, "", nonce, deadline, sig);
    }

    function test_executeWithSignature_invalid_signature_length_reverts() public {
        vm.etch(user, address(delegate).code);
        MagneeDelegateAccount userDelegate = MagneeDelegateAccount(payable(user));

        vm.prank(attacker);
        vm.expectRevert(MagneeDelegateAccount.InvalidSignature.selector);
        userDelegate.executeWithSignature(target, 0, "", 1, block.timestamp + 1 hours, hex"1234");
    }

    // ── Event Emission ─────────────────────────────────────────────────────

    function test_execute_emits_event() public {
        vm.prank(address(delegate));
        vm.expectEmit(true, false, false, true);
        emit MagneeDelegateAccount.Executed(target, 0, true);
        delegate.executeSingle(target, 0, "");
    }

    // ── Helper ─────────────────────────────────────────────────────────────

    function _sign(
        uint256 pk,
        address verifyingContract,
        address _target,
        uint256 _value,
        bytes memory _data,
        uint256 _nonce,
        uint256 _deadline
    ) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, verifyingContract)
        );

        bytes32 structHash = keccak256(
            abi.encode(EXECUTE_TYPEHASH, _target, _value, keccak256(_data), _nonce, _deadline)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MagneeRouter.sol";

/// @title Test target contract that accepts ETH
contract PayableTarget {
    event Received(address sender, uint256 value, bytes data);

    uint256 public lastValue;
    bytes public lastData;

    function payableFunction(
        uint256 someParam
    ) external payable returns (uint256) {
        lastValue = msg.value;
        lastData = msg.data;
        emit Received(msg.sender, msg.value, msg.data);
        return someParam * 2;
    }

    function revertingFunction() external payable {
        revert("Target reverted");
    }

    receive() external payable {}
}

contract MagneeRouterTest is Test {
    MagneeRouter public router;
    PayableTarget public target;

    event MagneeCall(
        address indexed sender,
        address indexed target,
        uint256 value,
        bytes data
    );

    function setUp() public {
        router = new MagneeRouter();
        target = new PayableTarget();
    }

    function test_ForwardPayableCall() public {
        uint256 ethValue = 0.1 ether;
        uint256 param = 42;
        bytes memory callData = abi.encodeWithSelector(
            PayableTarget.payableFunction.selector,
            param
        );

        vm.deal(address(this), 1 ether);

        vm.expectEmit(true, true, false, true);
        emit MagneeCall(address(this), address(target), ethValue, callData);

        bytes memory returnData = router.forward{value: ethValue}(
            address(target),
            callData
        );

        // Check return value
        uint256 result = abi.decode(returnData, (uint256));
        assertEq(result, param * 2);

        // Check target received correctly
        assertEq(target.lastValue(), ethValue);
        assertEq(address(target).balance, ethValue);
    }

    function test_BubblesRevert() public {
        bytes memory callData = abi.encodeWithSelector(
            PayableTarget.revertingFunction.selector
        );

        vm.deal(address(this), 1 ether);

        vm.expectRevert("Target reverted");
        router.forward{value: 0.1 ether}(address(target), callData);
    }

    function test_ForwardWithNoValue() public {
        bytes memory callData = abi.encodeWithSelector(
            PayableTarget.payableFunction.selector,
            uint256(100)
        );

        bytes memory returnData = router.forward(address(target), callData);
        uint256 result = abi.decode(returnData, (uint256));
        assertEq(result, 200);
        assertEq(target.lastValue(), 0);
    }
}

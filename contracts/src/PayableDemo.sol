// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title PayableDemo - A simple payable contract for testing
contract PayableDemo {
    event DonationReceived(
        address indexed from,
        uint256 amount,
        string message
    );

    uint256 public totalDonations;
    mapping(address => uint256) public donations;

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    function donate(string calldata message) external payable {
        require(msg.value > 0, "Must send ETH");

        donations[msg.sender] += msg.value;
        totalDonations += msg.value;

        emit DonationReceived(msg.sender, msg.value, message);
    }

    receive() external payable {
        donations[msg.sender] += msg.value;
        totalDonations += msg.value;
        emit DonationReceived(msg.sender, msg.value, "");
    }

    function withdraw() external onlyOwner {
        (bool success, ) = owner.call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Treasury is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    event FundsTransferred(address indexed to, uint256 amount);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        require(initialOwner != address(0), "Treasury: zero owner");
        __Ownable_init(initialOwner);
    }

    receive() external payable {}

    function transferETH(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Treasury: zero recipient");
        require(amount <= address(this).balance, "Treasury: insufficient funds");
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "Treasury: transfer failed");
        emit FundsTransferred(recipient, amount);
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    function version() external pure virtual returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}

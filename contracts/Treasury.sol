// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract Treasury is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    event FundsTransferred(address indexed to, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    receive() external payable {}

    function transferFunds(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Treasury: Insufficient funds");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Treasury: transfer failed");
        emit FundsTransferred(to, amount);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}

//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract Allowlist is Ownable, ReentrancyGuard {
    /* ========== STATE VARIABLES ========== */

    mapping(bytes32 => bool) public allowedItems;

    /* ========== CONSTRUCTOR ========== */
    constructor() {}

    /* ========== VIEWS ========== */

    function isAllowed(bytes32 key) external view returns (bool) {
        return allowedItems[key];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function setAllowed(bytes32 key) external nonReentrant onlyOwner {
        allowedItems[key] = true;
        emit ItemAllowed(key);
    }

    function setNotAllowed(bytes32 key) external nonReentrant onlyOwner {
        allowedItems[key] = false;
        emit ItemNotAllowed(key);
    }

    /* ========== EVENTS ========== */

    event ItemAllowed(bytes32 indexed key);
    event ItemNotAllowed(bytes32 indexed key);
}

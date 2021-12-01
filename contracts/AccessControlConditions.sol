//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract AccessControlConditions is ReentrancyGuard {

    /* ========== STRUCTS ========== */
    struct StoredCondition {
        uint256 value;
        uint256 chainId;
    }

    /* ========== STATE VARIABLES ========== */

    mapping(uint256 => StoredCondition) public storedConditions;

    /* ========== CONSTRUCTOR ========== */
    constructor() {
    }

    /* ========== VIEWS ========== */

    function getCondition(uint256 key) external view returns (StoredCondition memory) {
        return storedConditions[key];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function storeCondition(uint256 key, uint256 value, uint256 chainId)
        external
        nonReentrant
    {
        require(key != 0, "Key must not be zero");
        require(storedConditions[key].value == 0, "Condition already stored with this key");
        storedConditions[key] = StoredCondition(value, chainId);
        emit ConditionStored(key, value, chainId);
    }


    /* ========== EVENTS ========== */

    event ConditionStored(uint indexed key, uint256 value, uint256 chainId);
}

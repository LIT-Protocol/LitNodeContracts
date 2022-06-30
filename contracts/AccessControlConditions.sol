//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract AccessControlConditions is ReentrancyGuard {
    /* ========== STRUCTS ========== */
    struct StoredCondition {
        uint256 value;
        uint256 chainId;
        bool permanent;
        address creator;
    }

    /* ========== STATE VARIABLES ========== */

    mapping(uint256 => StoredCondition) public storedConditions;

    /* ========== CONSTRUCTOR ========== */
    constructor() {}

    /* ========== VIEWS ========== */

    function getCondition(uint256 key)
        external
        view
        returns (StoredCondition memory)
    {
        return storedConditions[key];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function storeCondition(
        uint256 key,
        uint256 value,
        uint256 chainId,
        bool permanent
    ) external nonReentrant {
        require(key != 0, "Key must not be zero");
        if (storedConditions[key].creator != address(0)) {
            // this is an update
            require(
                storedConditions[key].creator == msg.sender,
                "Only the condition creator can update it"
            );
            require(
                storedConditions[key].permanent == false,
                "This condition was stored with the Permanent flag and cannot be updated"
            );
        }
        storedConditions[key] = StoredCondition(
            value,
            chainId,
            permanent,
            msg.sender
        );

        emit ConditionStored(key, value, chainId, permanent, msg.sender);
    }

    /* ========== EVENTS ========== */

    event ConditionStored(
        uint256 indexed key,
        uint256 value,
        uint256 chainId,
        bool permanent,
        address creator
    );
}

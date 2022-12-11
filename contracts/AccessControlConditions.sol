//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract AccessControlConditions is Ownable, ReentrancyGuard {
    /* ========== STRUCTS ========== */
    struct StoredCondition {
        uint value;
        uint securityHash;
        uint chainId;
        bool permanent;
        address creator;
    }

    /* ========== STATE VARIABLES ========== */

    mapping(uint => StoredCondition) public storedConditions;
    address public signer;

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        signer = msg.sender;
    }

    /* ========== VIEWS ========== */

    function getCondition(
        uint key
    ) external view returns (StoredCondition memory) {
        return storedConditions[key];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function storeCondition(
        uint key,
        uint value,
        uint securityHash,
        uint chainId,
        bool permanent
    ) external nonReentrant {
        _storeCondition(
            key,
            value,
            securityHash,
            chainId,
            permanent,
            msg.sender
        );
    }

    function storeConditionWithSigner(
        uint key,
        uint value,
        uint securityHash,
        uint chainId,
        bool permanent,
        address creatorAddress
    ) external nonReentrant {
        require(
            msg.sender == signer,
            "Only signer can call storeConditionsWithSigner."
        );
        _storeCondition(
            key,
            value,
            securityHash,
            chainId,
            permanent,
            creatorAddress
        );
    }

    function setSigner(address newSigner) public onlyOwner {
        signer = newSigner;
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _storeCondition(
        uint key,
        uint value,
        uint securityHash,
        uint chainId,
        bool permanent,
        address creatorAddress
    ) private {
        require(key != 0, "Key must not be zero");
        if (storedConditions[key].creator != address(0)) {
            // this is an update
            require(
                storedConditions[key].creator == creatorAddress,
                "Only the condition creator can update it"
            );
            require(
                storedConditions[key].permanent == false,
                "This condition was stored with the Permanent flag and cannot be updated"
            );
            require(msg.sender != signer, "Signer cannot update conditions");
        }
        storedConditions[key] = StoredCondition(
            value,
            securityHash,
            chainId,
            permanent,
            creatorAddress
        );

        emit ConditionStored(key, value, chainId, permanent, creatorAddress);
    }

    /* ========== EVENTS ========== */

    event ConditionStored(
        uint indexed key,
        uint value,
        uint chainId,
        bool permanent,
        address creator
    );
}

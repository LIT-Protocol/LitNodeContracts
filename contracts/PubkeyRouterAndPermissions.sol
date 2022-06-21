//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {PKPNFT} from "./PKPNFT.sol";

import "hardhat/console.sol";

// TODO: make the tests send PKPNFT into the constructor
// TODO: test interaction between PKPNFT and this contract, like mint a keypair and see if you can access it
// TODO: setRoutingData() for a batch of keys

contract PubkeyRouterAndPermissions is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;

    struct PubkeyRoutingData {
      bytes32 keyPart1; // pubkeys are larger than 32 bytes
      bytes32 keyPart2; // so we pack them into these two 32 byte chunks
      uint keyLength; // length in bytes of the key
      address stakingContract;
      uint keyType; // 1 = BLS, 2 = ECDSA.  Not doing this in an enum so we can add more keytypes in the future without redeploying.
      uint ownerTokenId;
    }

    // map the sha256(compressed pubkey) -> PubkeyRoutingData
    mapping (bytes32 => PubkeyRoutingData) public pubkeys;

    // map the sha256(compressed pubkey) -> map of addresses to a bool
    // that is "true" if the address is allowed to sign with the pubkey
    mapping (bytes32 => EnumerableSet.AddressSet) permittedAddresses;

    // mononically increasing counter for the tokenIds
    uint public currentOwnerTokenId = 0;


    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft) {
        pkpNFT = PKPNFT(_pkpNft);
    }

    /* ========== VIEWS ========== */

    /// get the routing data for a given key hash
    function getRoutingData(bytes32 pubkeyHash) external view returns (PubkeyRoutingData memory) {
        return pubkeys[pubkeyHash];
    }

    /// get if a user is permitted to use a given pubkey.  returns true if they are the owner of the matching NFT, or if they are permitted to use the pubkey in the permittedAddresses[pubkeyHash] struct.
    function isPermitted(bytes32 pubkeyHash, address user) external view returns (bool) {
        uint tokenId = pubkeys[pubkeyHash].ownerTokenId;
        return pkpNFT.ownerOf(tokenId) == user || permittedAddresses[pubkeyHash].contains(user);
    }


    function getPermittedAddresses(bytes32 pubkeyHash) external view returns (address[] memory) {
        uint permittedAddressLength = permittedAddresses[pubkeyHash].length();
        address[] memory allPermittedAddresses = new address[](permittedAddressLength + 1);

        // always add nft owner in first slot
        uint tokenId = pubkeys[pubkeyHash].ownerTokenId;
        address nftOwner = pkpNFT.ownerOf(tokenId);
        allPermittedAddresses[0] = nftOwner;

        // add all other addresses
        for(uint i = 0; i < permittedAddressLength; i++) {
            allPermittedAddresses[i + 1] = permittedAddresses[pubkeyHash].at(i);
        }
        
        return allPermittedAddresses;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Set the pubkey and routing data for a given key hash
    function setRoutingData(bytes32 pubkeyHash, bytes32 keyPart1, bytes32 keyPart2, uint keyLength, address stakingContract, uint keyType) public onlyOwner {
        pubkeys[pubkeyHash].keyPart1 = keyPart1;
        pubkeys[pubkeyHash].keyPart2 = keyPart2;
        pubkeys[pubkeyHash].keyLength = keyLength;
        pubkeys[pubkeyHash].stakingContract = stakingContract;
        pubkeys[pubkeyHash].keyType = keyType;
        // currentOwnerTokenId starts at 0 but we want the first token id to be 1
        currentOwnerTokenId++;
        pubkeys[pubkeyHash].ownerTokenId = currentOwnerTokenId;
        emit PubkeyRoutingDataSet(pubkeyHash, keyPart1, keyPart2, keyLength, stakingContract, keyType, currentOwnerTokenId);
    }

    /// Add a permitted addresses for a given pubkey
    function addPermittedAddress(bytes32 pubkeyHash, address user) public {
        // check that user is allowed to set this
        uint tokenId = pubkeys[pubkeyHash].ownerTokenId;
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(msg.sender == nftOwner, "Only the PKP NFT owner can add and remove permitted addresses");
        
        EnumerableSet.AddressSet storage newPermittedUsers = permittedAddresses[pubkeyHash];
        newPermittedUsers.add(user);
        emit PermittedAddressAdded(pubkeyHash, user);
    }

    // Remove a permitted address for a given pubkey
    function removePermittedAddress(bytes32 pubkeyHash, address user) public {
        // check that user is allowed to set this
        uint tokenId = pubkeys[pubkeyHash].ownerTokenId;
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(msg.sender == nftOwner, "Only the PKP NFT owner can add and remove permitted addresses");

        EnumerableSet.AddressSet storage newPermittedUsers = permittedAddresses[pubkeyHash];
        newPermittedUsers.remove(user);
        emit PermittedAddressRemoved(pubkeyHash, user);
    }


    /* ========== EVENTS ========== */

    event PubkeyRoutingDataSet(bytes32 indexed pubkeyHash, bytes32 keyPart1, bytes32 keyPart2, uint keyLength, address stakingContract, uint keyType, uint ownerTokenId);
    event PermittedAddressAdded(bytes32 indexed pubkeyHash, address user);
    event PermittedAddressRemoved(bytes32 indexed pubkeyHash, address user);
}

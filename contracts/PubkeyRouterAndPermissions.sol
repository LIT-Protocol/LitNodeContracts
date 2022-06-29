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
    }

    // from https://github.com/saurfang/ipfs-multihash-on-solidity
    // for storing IPFS IDs
    struct Multihash {
        bytes32 digest;
        uint8 hashFunction;
        uint8 size;
    }

    // map the keccack256(compressed pubkey) -> PubkeyRoutingData
    mapping (uint => PubkeyRoutingData) public pubkeys;

    // map the keccack256(compressed pubkey) -> set of addresses
    // the address is allowed to sign with the pubkey if it's in the set of permittedAddresses for that pubkey
    mapping (uint => EnumerableSet.AddressSet) permittedAddresses;

    // maps the keccack256(hashFunction, size, digest) -> Multihash
    mapping (bytes32 => Multihash) public ipfsIds;

    // map the keccack256(compressed pubkey) -> set of hashes of IPFS IDs
    // the lit action is allowed to sign with the pubkey if it's IPFS ID is in the set of permittedActions for that pubkey
    mapping (uint => EnumerableSet.Bytes32Set) permittedActions;

    // mononically increasing counter for the tokenIds
    uint public currentOwnerTokenId = 0;


    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft) {
        pkpNFT = PKPNFT(_pkpNft);
    }

    /* ========== VIEWS ========== */

    /// get the routing data for a given key hash
    function getRoutingData(uint pubkeyHash) external view returns (PubkeyRoutingData memory) {
        return pubkeys[pubkeyHash];
    }

    /// get if a user is permitted to use a given pubkey.  returns true if they are the owner of the matching NFT, or if they are permitted to use the pubkey in the permittedAddresses[pubkeyHash] struct.
    function isPermitted(uint tokenId, address user) external view returns (bool) {
        return pkpNFT.ownerOf(tokenId) == user || permittedAddresses[tokenId].contains(user);
    }

    /// get if a given pubkey has routing data associated with it or not
    function isRouted(uint256 tokenId) external view returns (bool) {
        PubkeyRoutingData memory prd = pubkeys[tokenId];
        return prd.keyPart1 != 0 && prd.keyLength != 0 && prd.keyType != 0 && prd.stakingContract != address(0);
    }

    function getPermittedAddresses(uint tokenId) external view returns (address[] memory) {
        uint permittedAddressLength = permittedAddresses[tokenId].length();
        address[] memory allPermittedAddresses = new address[](permittedAddressLength + 1);

        // always add nft owner in first slot
        address nftOwner = pkpNFT.ownerOf(tokenId);
        allPermittedAddresses[0] = nftOwner;

        // add all other addresses
        for(uint i = 0; i < permittedAddressLength; i++) {
            allPermittedAddresses[i + 1] = permittedAddresses[tokenId].at(i);
        }
        
        return allPermittedAddresses;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Set the pubkey and routing data for a given key hash
    function setRoutingData(uint tokenId, bytes32 keyPart1, bytes32 keyPart2, uint keyLength, address stakingContract, uint keyType) public onlyOwner {
        pubkeys[tokenId].keyPart1 = keyPart1;
        pubkeys[tokenId].keyPart2 = keyPart2;
        pubkeys[tokenId].keyLength = keyLength;
        pubkeys[tokenId].stakingContract = stakingContract;
        pubkeys[tokenId].keyType = keyType;
        // currentOwnerTokenId starts at 0 but we want the first token id to be 1
        currentOwnerTokenId++;
        emit PubkeyRoutingDataSet(tokenId, keyPart1, keyPart2, keyLength, stakingContract, keyType, currentOwnerTokenId);
    }

    /// Add a permitted addresses for a given pubkey
    function addPermittedAddress(uint tokenId, address user) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(msg.sender == nftOwner, "Only the PKP NFT owner can add and remove permitted addresses");
        
        EnumerableSet.AddressSet storage newPermittedUsers = permittedAddresses[tokenId];
        newPermittedUsers.add(user);
        emit PermittedAddressAdded(tokenId, user);
    }

    // Remove a permitted address for a given pubkey
    function removePermittedAddress(uint tokenId, address user) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(msg.sender == nftOwner, "Only the PKP NFT owner can add and remove permitted addresses");

        EnumerableSet.AddressSet storage newPermittedUsers = permittedAddresses[tokenId];
        newPermittedUsers.remove(user);
        emit PermittedAddressRemoved(tokenId, user);
    }


    /* ========== EVENTS ========== */

    event PubkeyRoutingDataSet(uint indexed tokenId, bytes32 keyPart1, bytes32 keyPart2, uint keyLength, address stakingContract, uint keyType, uint ownerTokenId);
    event PermittedAddressAdded(uint indexed tokenId, address user);
    event PermittedAddressRemoved(uint indexed tokenId, address user);
}

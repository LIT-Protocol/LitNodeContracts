//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {PKPNFT} from "./PKPNFT.sol";
import {PubkeyRouter} from "./PubkeyRouter.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

import "hardhat/console.sol";

contract PKPPermissions is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using BytesLib for bytes;

    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;
    PubkeyRouter public router;

    struct AuthMethod {
        uint256 authMethodType; // 1 = WebAuthn, 2 = Discord.  Not doing this in an enum so that we can add more auth methods in the future without redeploying.
        bytes userId;
        bytes userPubkey;
    }

    // map the keccack256(uncompressed pubkey) -> set of addresses
    // the address is allowed to sign with the pubkey if it's in the set of permittedAddresses for that pubkey
    mapping(uint256 => EnumerableSet.AddressSet) permittedAddresses;

    // maps the keccack256(ipfsCID) -> ipfsCID
    mapping(bytes32 => bytes) public ipfsIds;

    // map the keccack256(uncompressed pubkey) -> set of hashes of IPFS IDs
    // the lit action is allowed to sign with the pubkey if it's IPFS ID is in the set of permittedActions for that pubkey
    mapping(uint256 => EnumerableSet.Bytes32Set) permittedActions;

    // map the keccack256(uncompressed pubkey) -> set of auth methods
    mapping(uint256 => EnumerableSet.UintSet) permittedAuthMethods;

    // map the keccack256(authMethodType, userId) -> the actual AuthMethod struct
    mapping(uint256 => AuthMethod) public authMethods;

    // map the keccack256(uncompressed pubkey) -> set of webAuthn users
    mapping(uint256 => EnumerableSet.UintSet) permittedWebAuthnUsers;

    // map the keccack256(uncompressed pubkey) -> WebAuthnUser
    mapping(uint256 => AuthMethod) public webAuthnUsers;

    // map the AuthMethod hash to the pubkeys that it's allowed to sign for
    // this makes it possible to be given a discord id and then lookup all the pubkeys that are allowed to sign for that discord id
    mapping(uint256 => EnumerableSet.UintSet) authMethodToPkpIds;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft, address _router) {
        pkpNFT = PKPNFT(_pkpNft);
        router = PubkeyRouter(_router);
    }

    /* ========== VIEWS ========== */

    function getAuthMethodId(uint256 authMethodType, bytes memory userId)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(authMethodType, userId)));
    }

    /// get the user's pubkey given their authMethodType and userId
    function getUserPubkeyForAuthMethod(
        uint authMethodType,
        bytes memory userId
    ) external view returns (bytes memory) {
        uint authMethodId = getAuthMethodId(authMethodType, userId);
        AuthMethod memory am = authMethods[authMethodId];
        return am.userPubkey;
    }

    /// get if a user is permitted to use a given pubkey.  returns true if it is permitted to use the pubkey in the permittedAuthMethods[tokenId] struct.
    function isPermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory userId,
        bytes memory userPubkey
    ) external view returns (bool) {
        uint authMethodId = getAuthMethodId(authMethodType, userId);
        AuthMethod memory am = authMethods[authMethodId];
        bool permitted = permittedAuthMethods[tokenId].contains(authMethodId);
        if (!permitted) {
            return false;
        }
        require(
            keccak256(am.userPubkey) == keccak256(userPubkey),
            "The pubkey you submitted does not match the one stored"
        );
        return true;
    }

    /// get if a Lit Action is permitted to use a given pubkey.  returns true if it is permitted to use the pubkey in the permittedActions[tokenId] struct.
    function isPermittedAction(uint256 tokenId, bytes memory ipfsCID)
        external
        view
        returns (bool)
    {
        bytes32 ipfsId = keccak256(ipfsCID);
        return permittedActions[tokenId].contains(ipfsId);
    }

    /// get if a user is permitted to use a given pubkey.  returns true if they are the owner of the matching NFT, or if they are permitted to use the pubkey in the permittedAddresses[pubkeyHash] struct.
    function isPermittedAddress(uint256 tokenId, address user)
        external
        view
        returns (bool)
    {
        return
            pkpNFT.ownerOf(tokenId) == user ||
            permittedAddresses[tokenId].contains(user);
    }

    function getPermittedActions(uint256 tokenId)
        external
        view
        returns (bytes[] memory)
    {
        uint256 permittedActionsLength = permittedActions[tokenId].length();
        bytes[] memory allPermittedActions = new bytes[](
            permittedActionsLength
        );

        for (uint256 i = 0; i < permittedActionsLength; i++) {
            bytes32 ipfsId = permittedActions[tokenId].at(i);
            allPermittedActions[i] = ipfsIds[ipfsId];
        }

        return allPermittedActions;
    }

    function getPermittedAddresses(uint256 tokenId)
        external
        view
        returns (address[] memory)
    {
        uint256 permittedAddressLength = permittedAddresses[tokenId].length();
        address[] memory allPermittedAddresses = new address[](
            permittedAddressLength + 1
        );

        // always add nft owner in first slot
        address nftOwner = pkpNFT.ownerOf(tokenId);
        allPermittedAddresses[0] = nftOwner;

        // add all other addresses
        for (uint256 i = 0; i < permittedAddressLength; i++) {
            allPermittedAddresses[i + 1] = permittedAddresses[tokenId].at(i);
        }

        return allPermittedAddresses;
    }

    function getPermittedAuthMethods(uint256 tokenId)
        external
        view
        returns (AuthMethod[] memory)
    {
        uint256 permittedAuthMethodsLength = permittedAuthMethods[tokenId]
            .length();
        AuthMethod[] memory allPermittedAuthMethods = new AuthMethod[](
            permittedAuthMethodsLength
        );

        for (uint256 i = 0; i < permittedAuthMethodsLength; i++) {
            uint authMethodHash = permittedAuthMethods[tokenId].at(i);
            allPermittedAuthMethods[i] = authMethods[authMethodHash];
        }

        return allPermittedAuthMethods;
    }

    function getTokenIdsForAuthMethod(
        uint256 authMethodType,
        bytes memory userId
    ) external view returns (uint[] memory) {
        uint authMethodId = getAuthMethodId(authMethodType, userId);

        uint256 pkpIdsLength = authMethodToPkpIds[authMethodId].length();
        uint[] memory allPkpIds = new uint[](pkpIdsLength);

        for (uint256 i = 0; i < pkpIdsLength; i++) {
            allPkpIds[i] = authMethodToPkpIds[authMethodId].at(i);
        }

        return allPkpIds;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Add a permitted action for a given pubkey
    function addPermittedAction(uint256 tokenId, bytes memory ipfsCID) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted actions"
        );

        // require(
        //     isActionRegistered(ipfsId) == true,
        //     "Please register your Lit Action IPFS ID with the registerAction() function before permitting it to use a PKP"
        // );

        bytes32 ipfsId = keccak256(ipfsCID);
        ipfsIds[ipfsId] = ipfsCID;

        EnumerableSet.Bytes32Set storage newPermittedActions = permittedActions[
            tokenId
        ];
        newPermittedActions.add(ipfsId);
        emit PermittedActionAdded(tokenId, ipfsId);
    }

    // Remove a permitted address for a given pubkey
    function removePermittedAction(uint256 tokenId, bytes memory ipfsCID)
        public
    {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted actions"
        );

        bytes32 ipfsId = keccak256(ipfsCID);

        EnumerableSet.Bytes32Set storage newPermittedActions = permittedActions[
            tokenId
        ];
        newPermittedActions.remove(ipfsId);
        emit PermittedActionRemoved(tokenId, ipfsId);
    }

    /// Add a permitted addresses for a given pubkey
    function addPermittedAddress(uint256 tokenId, address user) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted addresses"
        );

        EnumerableSet.AddressSet storage newPermittedUsers = permittedAddresses[
            tokenId
        ];
        newPermittedUsers.add(user);
        emit PermittedAddressAdded(tokenId, user);
    }

    // Remove a permitted address for a given pubkey
    function removePermittedAddress(uint256 tokenId, address user) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted addresses"
        );

        EnumerableSet.AddressSet storage newPermittedUsers = permittedAddresses[
            tokenId
        ];
        newPermittedUsers.remove(user);
        emit PermittedAddressRemoved(tokenId, user);
    }

    /// Add a permitted auth method for a given pubkey
    function addPermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory userId,
        bytes memory userPubkey
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted auth methods"
        );

        AuthMethod memory am = AuthMethod(authMethodType, userId, userPubkey);
        uint authMethodId = getAuthMethodId(authMethodType, userId);
        authMethods[authMethodId] = am;

        EnumerableSet.UintSet
            storage newPermittedAuthMethods = permittedAuthMethods[tokenId];
        newPermittedAuthMethods.add(authMethodId);

        EnumerableSet.UintSet storage newPkpIds = authMethodToPkpIds[
            authMethodId
        ];
        newPkpIds.add(tokenId);

        emit PermittedAuthMethodAdded(tokenId, authMethodId);
    }

    // Remove a permitted auth method for a given pubkey
    function removePermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory userId
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted addresses"
        );

        uint authMethodId = getAuthMethodId(authMethodType, userId);

        EnumerableSet.UintSet
            storage newPermittedAuthMethods = permittedAuthMethods[tokenId];
        newPermittedAuthMethods.remove(authMethodId);

        EnumerableSet.UintSet storage newPkpIds = authMethodToPkpIds[
            authMethodId
        ];
        newPkpIds.remove(tokenId);

        emit PermittedAuthMethodRemoved(tokenId, authMethodId);
    }

    function setPkpNftAddress(address newPkpNftAddress) public onlyOwner {
        pkpNFT = PKPNFT(newPkpNftAddress);
    }

    function setRouterAddress(address newRouterAddress) public onlyOwner {
        router = PubkeyRouter(newRouterAddress);
    }

    /* ========== EVENTS ========== */

    event PermittedAddressAdded(uint256 indexed tokenId, address user);
    event PermittedAddressRemoved(uint256 indexed tokenId, address user);
    event PermittedActionAdded(uint256 indexed tokenId, bytes32 ipfsId);
    event PermittedActionRemoved(uint256 indexed tokenId, bytes32 ipfsId);
    event PermittedAuthMethodAdded(uint256 indexed tokenId, uint authMethodId);
    event PermittedAuthMethodRemoved(
        uint256 indexed tokenId,
        uint authMethodId
    );
}

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

    enum AuthMethodType {
        NULLMETHOD, // 0
        ADDRESS, // 1
        ACTION, // 2
        WEBAUTHN, // 3
        DISCORD, // 4
        GOOGLE // 5
    }

    struct AuthMethod {
        uint256 authMethodType; // 1 = address, 2 = action, 3 = WebAuthn, 4 = Discord, 5 = Google.  Not doing this in an enum so that we can add more auth methods in the future without redeploying.
        bytes id; // the id of the auth method.  For address, this is an eth address.  For action, this is an IPFS CID.  For WebAuthn, this is the credentialId.  For Discord, this is the user's Discord ID.  For Google, this is the user's Google ID.
        bytes userPubkey; // the user's pubkey.  This is used for WebAuthn.
    }

    // map the keccack256(uncompressed pubkey) -> set of auth methods
    mapping(uint256 => EnumerableSet.UintSet) permittedAuthMethods;

    // map the keccack256(uncompressed pubkey) -> auth_method_id -> scope id
    mapping(uint256 => mapping(uint256 => EnumerableSet.UintSet)) permittedAuthMethodScopes;

    // map the keccack256(authMethodType, userId, userPubkey) -> the actual AuthMethod struct
    mapping(uint256 => AuthMethod) public authMethods;

    // map the AuthMethod hash to the pubkeys that it's allowed to sign for
    // this makes it possible to be given a discord id and then lookup all the pubkeys that are allowed to sign for that discord id
    mapping(uint256 => EnumerableSet.UintSet) authMethodToPkpIds;

    // map keccak256(authMethodType, userId) -> keccack256(authMethodType, userId, userPubkey)
    mapping(uint256 => uint256) public idToUserPubkeyLookup;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft, address _router) {
        pkpNFT = PKPNFT(_pkpNft);
        router = PubkeyRouter(_router);
    }

    /* ========== VIEWS ========== */

    /// get the eth address for the keypair, as long as it's an ecdsa keypair
    function getEthAddress(uint256 tokenId) public view returns (address) {
        return router.getEthAddress(tokenId);
    }

    /// includes the 0x04 prefix so you can pass this directly to ethers.utils.computeAddress
    function getPubkey(uint256 tokenId) public view returns (bytes memory) {
        return router.getPubkey(tokenId);
    }

    function getAuthMethodId(
        uint256 authMethodType,
        bytes memory id,
        bytes memory userPubkey
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(authMethodType, id, userPubkey)));
    }

    /// get the user's pubkey given their authMethodType and userId
    function getUserPubkeyForAuthMethod(uint authMethodType, bytes memory id)
        external
        view
        returns (bytes memory)
    {
        uint256 authMethodHashWithoutPubkey = uint256(
            keccak256(abi.encode(authMethodType, id))
        );
        uint256 authMethodId = idToUserPubkeyLookup[
            authMethodHashWithoutPubkey
        ];
        AuthMethod memory am = authMethods[authMethodId];
        return am.userPubkey;
    }

    /// get if a user is permitted to use a given pubkey.  returns true if it is permitted to use the pubkey in the permittedAuthMethods[tokenId] struct.
    function isPermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory id,
        bytes memory userPubkey
    ) external view returns (bool) {
        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);
        bool permitted = permittedAuthMethods[tokenId].contains(authMethodId);
        if (!permitted) {
            return false;
        }
        return true;
    }

    function isPermittedAuthMethodScopePresent(
        uint256 tokenId,
        uint authMethodType,
        bytes memory id,
        bytes memory userPubkey,
        uint scopeId
    ) external view returns (bool) {
        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);
        bool present = permittedAuthMethodScopes[tokenId][authMethodId]
            .contains(scopeId);
        if (!present) {
            return false;
        }
        return true;
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

    function getPermittedAuthMethodScopes(uint256 tokenId, uint256 authMethodId)
        public
        view
        returns (uint256[] memory)
    {
        uint256 permittedScopesLength = permittedAuthMethodScopes[tokenId][
            authMethodId
        ].length();
        uint256[] memory allPermittedScopes = new uint256[](
            permittedScopesLength
        );

        for (uint256 i = 0; i < permittedScopesLength; i++) {
            uint scopeId = permittedAuthMethodScopes[tokenId][authMethodId].at(
                i
            );
            allPermittedScopes[i] = scopeId;
        }

        return allPermittedScopes;
    }

    function getTokenIdsForAuthMethod(
        uint256 authMethodType,
        bytes memory id,
        bytes memory userPubkey
    ) external view returns (uint[] memory) {
        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);

        uint256 pkpIdsLength = authMethodToPkpIds[authMethodId].length();
        uint[] memory allPkpIds = new uint[](pkpIdsLength);

        for (uint256 i = 0; i < pkpIdsLength; i++) {
            allPkpIds[i] = authMethodToPkpIds[authMethodId].at(i);
        }

        return allPkpIds;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Add a permitted auth method for a given pubkey
    function addPermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory id,
        bytes memory userPubkey,
        uint256[] memory scopes
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted auth methods"
        );

        AuthMethod memory am = AuthMethod(authMethodType, id, userPubkey);
        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);
        authMethods[authMethodId] = am;

        EnumerableSet.UintSet
            storage newPermittedAuthMethods = permittedAuthMethods[tokenId];
        newPermittedAuthMethods.add(authMethodId);

        EnumerableSet.UintSet storage newPkpIds = authMethodToPkpIds[
            authMethodId
        ];
        newPkpIds.add(tokenId);

        for (uint256 i = 0; i < scopes.length; i++) {
            uint256 scopeId = scopes[i];
            permittedAuthMethodScopes[tokenId][authMethodId].add(scopeId);
        }

        uint256 authMethodHashWithoutPubkey = uint256(
            keccak256(abi.encode(authMethodType, id))
        );

        // we need to ensure that someone with the same auth method type and id can't add a different pubkey
        if (idToUserPubkeyLookup[authMethodHashWithoutPubkey] != 0) {
            // if the idToUserPubkeyLookup is already set, then we need to ensure that the pubkey is the same
            require(
                idToUserPubkeyLookup[authMethodHashWithoutPubkey] ==
                    authMethodId,
                "Cannot add a different pubkey for the same auth method type and id"
            );
        }

        idToUserPubkeyLookup[authMethodHashWithoutPubkey] = authMethodId;

        emit PermittedAuthMethodAdded(tokenId, authMethodType, id, userPubkey);
    }

    // Remove a permitted auth method for a given pubkey
    function removePermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory id,
        bytes memory userPubkey
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted addresses"
        );

        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);

        EnumerableSet.UintSet
            storage newPermittedAuthMethods = permittedAuthMethods[tokenId];
        newPermittedAuthMethods.remove(authMethodId);

        EnumerableSet.UintSet storage newPkpIds = authMethodToPkpIds[
            authMethodId
        ];
        newPkpIds.remove(tokenId);

        emit PermittedAuthMethodRemoved(tokenId, authMethodId, id, userPubkey);
    }

    function addPermittedAuthMethodScope(
        uint256 tokenId,
        uint authMethodType,
        bytes memory id,
        bytes memory userPubkey,
        uint256 scopeId
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted auth method scoped"
        );

        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);

        permittedAuthMethodScopes[tokenId][authMethodId].add(scopeId);

        emit PermittedAuthMethodScopeAdded(
            tokenId,
            authMethodId,
            id,
            userPubkey,
            scopeId
        );
    }

    function removePermittedAuthMethodScope(
        uint256 tokenId,
        uint authMethodType,
        bytes memory id,
        bytes memory userPubkey,
        uint256 scopeId
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted auth method scopes"
        );

        uint authMethodId = getAuthMethodId(authMethodType, id, userPubkey);

        permittedAuthMethodScopes[tokenId][authMethodId].remove(scopeId);

        emit PermittedAuthMethodScopeRemoved(
            tokenId,
            authMethodType,
            id,
            userPubkey,
            scopeId
        );
    }

    /// Add a permitted action for a given pubkey
    function addPermittedAction(
        uint256 tokenId,
        bytes memory ipfsCID,
        uint256[] memory scopes
    ) public {
        addPermittedAuthMethod(
            tokenId,
            uint(AuthMethodType.ACTION),
            ipfsCID,
            "",
            scopes
        );
    }

    function removePermittedAction(uint256 tokenId, bytes memory ipfsCID)
        public
    {
        removePermittedAuthMethod(
            tokenId,
            uint(AuthMethodType.ACTION),
            ipfsCID,
            ""
        );
    }

    function addPermittedAddress(
        uint256 tokenId,
        address user,
        uint256[] memory scopes
    ) public {
        addPermittedAuthMethod(
            tokenId,
            uint(AuthMethodType.ADDRESS),
            abi.encodePacked(user),
            "",
            scopes
        );
    }

    function removePermittedAddress(uint256 tokenId, address user) public {
        removePermittedAuthMethod(
            tokenId,
            uint(AuthMethodType.ADDRESS),
            abi.encodePacked(user),
            ""
        );
    }

    function setPkpNftAddress(address newPkpNftAddress) public onlyOwner {
        pkpNFT = PKPNFT(newPkpNftAddress);
    }

    function setRouterAddress(address newRouterAddress) public onlyOwner {
        router = PubkeyRouter(newRouterAddress);
    }

    /* ========== EVENTS ========== */

    event PermittedAuthMethodAdded(
        uint256 indexed tokenId,
        uint authMethodType,
        bytes id,
        bytes userPubkey
    );
    event PermittedAuthMethodRemoved(
        uint256 indexed tokenId,
        uint authMethodType,
        bytes id,
        bytes userPubkey
    );
    event PermittedAuthMethodScopeAdded(
        uint256 indexed tokenId,
        uint authMethodType,
        bytes id,
        bytes userPubkey,
        uint256 scopeId
    );
    event PermittedAuthMethodScopeRemoved(
        uint256 indexed tokenId,
        uint authMethodType,
        bytes id,
        bytes userPubkey,
        uint256 scopeId
    );
}

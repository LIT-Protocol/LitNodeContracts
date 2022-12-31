//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { PKPNFT } from "./PKPNFT.sol";
import { PubkeyRouter } from "./PubkeyRouter.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

import "hardhat/console.sol";

contract PKPPermissions is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using BytesLib for bytes;
    using BitMaps for BitMaps.BitMap;

    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;
    PubkeyRouter public router;

    enum AuthMethodType {
        NULLMETHOD, // 0
        ADDRESS, // 1
        ACTION, // 2
        WEBAUTHN, // 3
        DISCORD, // 4
        GOOGLE, // 5
        GOOGLE_JWT // 6
    }

    struct AuthMethod {
        uint256 authMethodType; // 1 = address, 2 = action, 3 = WebAuthn, 4 = Discord, 5 = Google, 6 = Google JWT.  Not doing this in an enum so that we can add more auth methods in the future without redeploying.
        bytes id; // the id of the auth method.  For address, this is an eth address.  For action, this is an IPFS CID.  For WebAuthn, this is the credentialId.  For Discord, this is the user's Discord ID.  For Google, this is the user's Google ID.
        bytes userPubkey; // the user's pubkey.  This is used for WebAuthn.
    }

    // map the keccack256(uncompressed pubkey) -> set of auth methods
    mapping(uint256 => EnumerableSet.UintSet) permittedAuthMethods;

    // map the keccack256(uncompressed pubkey) -> auth_method_id -> scope id
    mapping(uint256 => mapping(uint256 => BitMaps.BitMap)) permittedAuthMethodScopes;

    // map the keccack256(authMethodType, userId) -> the actual AuthMethod struct
    mapping(uint256 => AuthMethod) public authMethods;

    // map the AuthMethod hash to the pubkeys that it's allowed to sign for
    // this makes it possible to be given a discord id and then lookup all the pubkeys that are allowed to sign for that discord id
    mapping(uint256 => EnumerableSet.UintSet) authMethodToPkpIds;

    // map the keccack256(uncompressed pubkey) -> (group => merkle tree root hash)
    mapping(uint256 => mapping(uint256 => bytes32)) private _rootHashes;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft, address _router) {
        pkpNFT = PKPNFT(_pkpNft);
        router = PubkeyRouter(_router);
    }

    /* ========== Modifier ========== */
    modifier onlyPKPOwner(uint256 tokenId) {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(msg.sender == nftOwner, "Not PKP NFT owner");
        _;
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

    function getAuthMethodId(uint256 authMethodType, bytes memory id)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(authMethodType, id)));
    }

    /// get the user's pubkey given their authMethodType and userId
    function getUserPubkeyForAuthMethod(
        uint256 authMethodType,
        bytes calldata id
    ) external view returns (bytes memory) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);
        AuthMethod memory am = authMethods[authMethodId];
        return am.userPubkey;
    }

    function getTokenIdsForAuthMethod(uint256 authMethodType, bytes calldata id)
        external
        view
        returns (uint256[] memory)
    {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);

        uint256 pkpIdsLength = authMethodToPkpIds[authMethodId].length();
        uint256[] memory allPkpIds = new uint256[](pkpIdsLength);

        for (uint256 i = 0; i < pkpIdsLength; i++) {
            allPkpIds[i] = authMethodToPkpIds[authMethodId].at(i);
        }

        return allPkpIds;
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
            uint256 authMethodHash = permittedAuthMethods[tokenId].at(i);
            allPermittedAuthMethods[i] = authMethods[authMethodHash];
        }

        return allPermittedAuthMethods;
    }

    function getPermittedAuthMethodScopes(
        uint256 tokenId,
        uint256 authMethodType,
        bytes calldata id,
        uint256 maxScopeId
    ) public view returns (bool[] memory) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);
        BitMaps.BitMap
            storage permittedScopesBitMap = permittedAuthMethodScopes[tokenId][
                authMethodId
            ];
        bool[] memory allScopes = new bool[](maxScopeId);

        for (uint256 i = 0; i < maxScopeId; i++) {
            allScopes[i] = permittedScopesBitMap.get(i);
        }

        return allScopes;
    }

    function getPermittedActions(uint256 tokenId)
        public
        view
        returns (bytes[] memory)
    {
        uint256 permittedAuthMethodsLength = permittedAuthMethods[tokenId]
            .length();

        // count the number of auth methods that are actions
        uint256 permittedActionsLength = 0;
        for (uint256 i = 0; i < permittedAuthMethodsLength; i++) {
            uint256 authMethodHash = permittedAuthMethods[tokenId].at(i);
            AuthMethod memory am = authMethods[authMethodHash];
            if (am.authMethodType == uint256(AuthMethodType.ACTION)) {
                permittedActionsLength++;
            }
        }

        bytes[] memory allPermittedActions = new bytes[](
            permittedActionsLength
        );

        uint256 permittedActionsIndex = 0;
        for (uint256 i = 0; i < permittedAuthMethodsLength; i++) {
            uint256 authMethodHash = permittedAuthMethods[tokenId].at(i);
            AuthMethod memory am = authMethods[authMethodHash];
            if (am.authMethodType == uint256(AuthMethodType.ACTION)) {
                allPermittedActions[permittedActionsIndex] = am.id;
                permittedActionsIndex++;
            }
        }

        return allPermittedActions;
    }

    function getPermittedAddresses(uint256 tokenId)
        public
        view
        returns (address[] memory)
    {
        uint256 permittedAuthMethodsLength = permittedAuthMethods[tokenId]
            .length();

        // count the number of auth methods that are addresses
        uint256 permittedAddressLength = 0;
        for (uint256 i = 0; i < permittedAuthMethodsLength; i++) {
            uint256 authMethodHash = permittedAuthMethods[tokenId].at(i);
            AuthMethod memory am = authMethods[authMethodHash];
            if (am.authMethodType == uint256(AuthMethodType.ADDRESS)) {
                permittedAddressLength++;
            }
        }

        bool tokenExists = pkpNFT.exists(tokenId);
        address[] memory allPermittedAddresses;
        uint256 permittedAddressIndex = 0;
        if (tokenExists) {
            // token is not burned, so add the owner address
            allPermittedAddresses = new address[](permittedAddressLength + 1);

            // always add nft owner in first slot
            address nftOwner = pkpNFT.ownerOf(tokenId);
            allPermittedAddresses[0] = nftOwner;
            permittedAddressIndex++;
        } else {
            // token is burned, so don't add the owner address
            allPermittedAddresses = new address[](permittedAddressLength);
        }

        for (uint256 i = 0; i < permittedAuthMethodsLength; i++) {
            uint256 authMethodHash = permittedAuthMethods[tokenId].at(i);
            AuthMethod memory am = authMethods[authMethodHash];
            if (am.authMethodType == uint256(AuthMethodType.ADDRESS)) {
                address parsed;
                bytes memory id = am.id;

                // address was packed using abi.encodedPacked(address), so you need to pad left to get the correct bytes back
                assembly {
                    parsed := div(
                        mload(add(id, 32)),
                        0x1000000000000000000000000
                    )
                }
                allPermittedAddresses[permittedAddressIndex] = parsed;
                permittedAddressIndex++;
            }
        }

        return allPermittedAddresses;
    }

    /// get if a user is permitted to use a given pubkey.  returns true if it is permitted to use the pubkey in the permittedAuthMethods[tokenId] struct.
    function isPermittedAuthMethod(
        uint256 tokenId,
        uint256 authMethodType,
        bytes memory id
    ) public view returns (bool) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);
        bool permitted = permittedAuthMethods[tokenId].contains(authMethodId);
        if (!permitted) {
            return false;
        }
        return true;
    }

    function isPermittedAuthMethodScopePresent(
        uint256 tokenId,
        uint256 authMethodType,
        bytes calldata id,
        uint256 scopeId
    ) public view returns (bool) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);
        bool present = permittedAuthMethodScopes[tokenId][authMethodId].get(
            scopeId
        );
        return present;
    }

    function isPermittedAction(uint256 tokenId, bytes calldata ipfsCID)
        public
        view
        returns (bool)
    {
        return
            isPermittedAuthMethod(
                tokenId,
                uint256(AuthMethodType.ACTION),
                ipfsCID
            );
    }

    function isPermittedAddress(uint256 tokenId, address user)
        public
        view
        returns (bool)
    {
        return
            isPermittedAuthMethod(
                tokenId,
                uint256(AuthMethodType.ADDRESS),
                abi.encodePacked(user)
            ) || pkpNFT.ownerOf(tokenId) == user;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Add a permitted auth method for a given pubkey
    function addPermittedAuthMethod(
        uint256 tokenId,
        AuthMethod memory authMethod,
        uint256[] calldata scopes
    ) public onlyPKPOwner(tokenId) {
        uint256 authMethodId = getAuthMethodId(
            authMethod.authMethodType,
            authMethod.id
        );

        // we need to ensure that someone with the same auth method type and id can't add a different pubkey
        require(
            authMethods[authMethodId].userPubkey.length == 0 ||
                keccak256(authMethods[authMethodId].userPubkey) ==
                keccak256(authMethod.userPubkey),
            "Cannot add a different pubkey for the same auth method type and id"
        );

        authMethods[authMethodId] = authMethod;

        EnumerableSet.UintSet
            storage newPermittedAuthMethods = permittedAuthMethods[tokenId];
        newPermittedAuthMethods.add(authMethodId);

        EnumerableSet.UintSet storage newPkpIds = authMethodToPkpIds[
            authMethodId
        ];
        newPkpIds.add(tokenId);

        for (uint256 i = 0; i < scopes.length; i++) {
            uint256 scopeId = scopes[i];

            permittedAuthMethodScopes[tokenId][authMethodId].set(scopeId);

            emit PermittedAuthMethodScopeAdded(
                tokenId,
                authMethodId,
                authMethod.id,
                scopeId
            );
        }

        emit PermittedAuthMethodAdded(
            tokenId,
            authMethod.authMethodType,
            authMethod.id,
            authMethod.userPubkey
        );
    }

    // Remove a permitted auth method for a given pubkey
    function removePermittedAuthMethod(
        uint256 tokenId,
        uint256 authMethodType,
        bytes memory id
    ) public onlyPKPOwner(tokenId) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);

        EnumerableSet.UintSet
            storage newPermittedAuthMethods = permittedAuthMethods[tokenId];
        newPermittedAuthMethods.remove(authMethodId);

        EnumerableSet.UintSet storage newPkpIds = authMethodToPkpIds[
            authMethodId
        ];
        newPkpIds.remove(tokenId);

        emit PermittedAuthMethodRemoved(tokenId, authMethodId, id);
    }

    function addPermittedAuthMethodScope(
        uint256 tokenId,
        uint256 authMethodType,
        bytes calldata id,
        uint256 scopeId
    ) public onlyPKPOwner(tokenId) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);

        permittedAuthMethodScopes[tokenId][authMethodId].set(scopeId);

        emit PermittedAuthMethodScopeAdded(tokenId, authMethodId, id, scopeId);
    }

    function removePermittedAuthMethodScope(
        uint256 tokenId,
        uint256 authMethodType,
        bytes calldata id,
        uint256 scopeId
    ) public onlyPKPOwner(tokenId) {
        uint256 authMethodId = getAuthMethodId(authMethodType, id);

        permittedAuthMethodScopes[tokenId][authMethodId].unset(scopeId);

        emit PermittedAuthMethodScopeRemoved(
            tokenId,
            authMethodType,
            id,
            scopeId
        );
    }

    /// Add a permitted action for a given pubkey
    function addPermittedAction(
        uint256 tokenId,
        bytes calldata ipfsCID,
        uint256[] calldata scopes
    ) public {
        addPermittedAuthMethod(
            tokenId,
            AuthMethod(uint256(AuthMethodType.ACTION), ipfsCID, ""),
            scopes
        );
    }

    function removePermittedAction(uint256 tokenId, bytes calldata ipfsCID)
        public
    {
        removePermittedAuthMethod(
            tokenId,
            uint256(AuthMethodType.ACTION),
            ipfsCID
        );
    }

    function addPermittedAddress(
        uint256 tokenId,
        address user,
        uint256[] calldata scopes
    ) public {
        addPermittedAuthMethod(
            tokenId,
            AuthMethod(
                uint256(AuthMethodType.ADDRESS),
                abi.encodePacked(user),
                ""
            ),
            scopes
        );
    }

    function removePermittedAddress(uint256 tokenId, address user) public {
        removePermittedAuthMethod(
            tokenId,
            uint256(AuthMethodType.ADDRESS),
            abi.encodePacked(user)
        );
    }

    function setPkpNftAddress(address newPkpNftAddress) public onlyOwner {
        pkpNFT = PKPNFT(newPkpNftAddress);
    }

    function setRouterAddress(address newRouterAddress) public onlyOwner {
        router = PubkeyRouter(newRouterAddress);
    }

    /**
     * Update the root hash of the merkle tree representing off-chain states for the PKP
     */
    function setRootHash(
        uint256 tokenId,
        uint256 group,
        bytes32 root
    ) public onlyPKPOwner(tokenId) {
        _rootHashes[tokenId][group] = root;
        emit RootHashUpdated(tokenId, group, root);
    }

    /**
     * Verify the given leaf existing in the merkle tree
     */
    function verifyState(
        uint256 tokenId,
        uint256 group,
        bytes32[] memory proof,
        bytes32 leaf
    ) public view returns (bool) {
        bytes32 root = _rootHashes[tokenId][group];
        if (root == bytes32(0)) return false;
        return MerkleProof.verify(proof, root, leaf);
    }

    /**
     * Verify the given leaves existing in the merkle tree
     */
    function verifyStates(
        uint256 tokenId,
        uint256 group,
        bytes32[] memory proof,
        bool[] memory proofFlags,
        bytes32[] memory leaves
    ) public view returns (bool) {
        bytes32 root = _rootHashes[tokenId][group];
        if (root == bytes32(0)) return false;
        return MerkleProof.multiProofVerify(proof, proofFlags, root, leaves);
    }

    /* ========== EVENTS ========== */

    event PermittedAuthMethodAdded(
        uint256 indexed tokenId,
        uint256 authMethodType,
        bytes id,
        bytes userPubkey
    );
    event PermittedAuthMethodRemoved(
        uint256 indexed tokenId,
        uint256 authMethodType,
        bytes id
    );
    event PermittedAuthMethodScopeAdded(
        uint256 indexed tokenId,
        uint256 authMethodType,
        bytes id,
        uint256 scopeId
    );
    event PermittedAuthMethodScopeRemoved(
        uint256 indexed tokenId,
        uint256 authMethodType,
        bytes id,
        uint256 scopeId
    );
    event RootHashUpdated(
        uint256 indexed tokenId,
        uint256 indexed group,
        bytes32 root
    );
}

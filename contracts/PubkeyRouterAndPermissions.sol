//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {PKPNFT} from "./PKPNFT.sol";
import {Staking} from "./Staking.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

import "hardhat/console.sol";

// TODO: make the tests send PKPNFT into the constructor
// TODO: test interaction between PKPNFT and this contract, like mint a keypair and see if you can access it
// TODO: setRoutingData() for a batch of keys

contract PubkeyRouterAndPermissions is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using BytesLib for bytes;

    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;

    struct PubkeyRoutingData {
        bytes32 keyPart1; // pubkeys are larger than 32 bytes
        bytes32 keyPart2; // so we pack them into these two 32 byte chunks
        uint256 keyLength; // length in bytes of the key
        address stakingContract;
        uint256 keyType; // 1 = BLS, 2 = ECDSA.  Not doing this in an enum so we can add more keytypes in the future without redeploying.
    }

    struct PubkeyRegistrationProgress {
        PubkeyRoutingData routingData;
        uint256 nodeVoteCount;
        uint256 nodeVoteThreshold;
        mapping(address => bool) votedNodes;
    }

    // from https://github.com/saurfang/ipfs-multihash-on-solidity
    // for storing IPFS IDs
    // struct Multihash {
    //     bytes32 digest;
    //     uint8 hashFunction;
    //     uint8 size;
    // }

    struct AuthMethod {
        uint256 authMethodType; // 1 = WebAuthn, 2 = Discord.  Not doing this in an enum so that we can add more auth methods in the future without redeploying.
        bytes userId;
    }

    // map the keccack256(uncompressed pubkey) -> PubkeyRoutingData
    mapping(uint256 => PubkeyRoutingData) public pubkeys;

    // this is used to count the votes from the nodes to register a key
    // map the keccack256(uncompressed pubkey) -> PubkeyRegistrationProgress
    mapping(uint256 => PubkeyRegistrationProgress) public pubkeyRegistrations;

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

    // map the AuthMethod hash to the pubkeys that it's allowed to sign for
    // this makes it possible to be given a discord id and then lookup all the pubkeys that are allowed to sign for that discord id
    mapping(uint256 => EnumerableSet.UintSet) authMethodToPkpIds;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft) {
        pkpNFT = PKPNFT(_pkpNft);
    }

    /* ========== VIEWS ========== */

    function getAuthMethodId(uint256 authMethodType, bytes memory userId)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(authMethodType, userId)));
    }

    function combineKeyParts(
        bytes32 keyPart1,
        bytes32 keyPart2,
        uint256 keyLength
    ) internal pure returns (bytes memory) {
        bytes memory key = new bytes(keyLength);
        for (uint256 i = 0; i < keyLength; i++) {
            if (i < 32) {
                key[i] = keyPart1[i];
            } else {
                key[i] = keyPart2[i - 32];
            }
        }
        return key;
    }

    /// includes the 0x04 prefix so you can pass this directly to ethers.utils.computeAddress
    function getEcdsaPubkey(uint256 tokenId)
        public
        view
        returns (bytes memory)
    {
        if (pubkeys[tokenId].keyType != 2) {
            return new bytes(0);
        }
        return abi.encodePacked(bytes1(0x04), getFullPubkey(tokenId));
    }

    /// get the full public key for the keypair
    function getFullPubkey(uint256 tokenId) public view returns (bytes memory) {
        return
            combineKeyParts(
                pubkeys[tokenId].keyPart1,
                pubkeys[tokenId].keyPart2,
                pubkeys[tokenId].keyLength
            );
    }

    // get the eth address for the keypair, as long as it's an ecdsa keypair
    function getEthAddress(uint256 tokenId) public view returns (address) {
        // only return addresses for ECDSA keys so that people don't
        // send funds to a BLS key that would be irretrieveably lost
        if (pubkeys[tokenId].keyType != 2) {
            return address(0);
        }
        bytes memory pubKey = getFullPubkey(tokenId);
        bytes memory hashed = abi.encodePacked(keccak256(pubKey));
        return address(hashed.toAddress(12));
    }

    /// get the routing data for a given key hash
    function getRoutingData(uint256 tokenId)
        external
        view
        returns (PubkeyRoutingData memory)
    {
        return pubkeys[tokenId];
    }

    /// get if a user is permitted to use a given pubkey.  returns true if it is permitted to use the pubkey in the permittedAuthMethods[tokenId] struct.
    function isPermittedAuthMethod(
        uint256 tokenId,
        uint authMethodType,
        bytes memory userId
    ) external view returns (bool) {
        uint authMethodId = getAuthMethodId(authMethodType, userId);
        return permittedAuthMethods[tokenId].contains(authMethodId);
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

    /// get if a given pubkey has routing data associated with it or not
    function isRouted(uint256 tokenId) public view returns (bool) {
        PubkeyRoutingData memory prd = pubkeys[tokenId];
        return
            prd.keyPart1 != 0 &&
            prd.keyLength != 0 &&
            prd.keyType != 0 &&
            prd.stakingContract != address(0);
    }

    /// get if a given pubkey has routing data associated with it or not
    // function isActionRegistered(bytes32 ipfsId) public view returns (bool) {
    //     return
    //         ipfsIds[ipfsId].digest != 0 &&
    //         ipfsIds[ipfsId].hashFunction != 0 &&
    //         ipfsIds[ipfsId].size != 0;
    // }

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
        returns (uint[] memory)
    {
        uint256 permittedAuthMethodsLength = permittedAuthMethods[tokenId]
            .length();
        uint[] memory allPermittedAuthMethods = new uint[](
            permittedAuthMethodsLength
        );

        for (uint256 i = 0; i < permittedAuthMethodsLength; i++) {
            allPermittedAuthMethods[i] = permittedAuthMethods[tokenId].at(i);
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

    /// Set the pubkey and routing data for a given key hash
    // this is only used by an admin in case of emergency.  can prob be removed.
    function setRoutingData(
        uint256 tokenId,
        bytes32 keyPart1,
        bytes32 keyPart2,
        uint256 keyLength,
        address stakingContract,
        uint256 keyType
    ) public onlyOwner {
        pubkeys[tokenId].keyPart1 = keyPart1;
        pubkeys[tokenId].keyPart2 = keyPart2;
        pubkeys[tokenId].keyLength = keyLength;
        pubkeys[tokenId].stakingContract = stakingContract;
        pubkeys[tokenId].keyType = keyType;

        pkpNFT.pkpRouted(tokenId, keyType);

        emit PubkeyRoutingDataSet(
            tokenId,
            keyPart1,
            keyPart2,
            keyLength,
            stakingContract,
            keyType
        );
    }

    /// vote to set the pubkey and routing data for a given key
    // FIXME this is vulnerable to an attack where the first node to call setRoutingData can set an incorrect key length, stakingContract, or keyType, since none of those are validated.  Then, if more nodes try to call setRoutingData with the correct data, it will revert because it doesn't match.  Instead, it should probably be vote based.  so if 1 guy votes for an incorrect keyLength, it doesn't matter, because the one that gets the most votes wins.
    // FIXME this is also vulnerable to an attack where someone sets up their own staking contract with a threshold of 1 and then goes around claiming tokenIds and filling them with junk.  we probably need to verify that the staking contract is legit.  i'm not sure how to do that though.  like we can check various things from the staking contract, that the staked token is the real Lit token, and that the user has staked a significant amount.  But how do we know that staking contract isn't a custom fork that lies about all that stuff?  Maybe we need a mapping of valid staking contracts somewhere, and when we deploy a new one we add it manually.
    function voteForRoutingData(
        uint256 tokenId,
        bytes32 keyPart1,
        bytes32 keyPart2,
        uint256 keyLength,
        address stakingContract,
        uint256 keyType
    ) public {
        // check that the sender is a staking node and hasn't already voted for this key
        Staking stakingContractInstance = Staking(stakingContract);
        address stakerAddress = stakingContractInstance
            .nodeAddressToStakerAddress(msg.sender);
        require(
            stakingContractInstance.isActiveValidator(stakerAddress),
            "Only active validators can set routing data"
        );

        require(
            !pubkeyRegistrations[tokenId].votedNodes[msg.sender],
            "You have already voted for this key"
        );

        require(keyLength <= 64, "Key length must be <= 64");

        // if this is the first registration, validate that the hashes match
        if (pubkeyRegistrations[tokenId].nodeVoteCount == 0) {
            // this is the only place where the tokenId could become decoupled from the keyParts.
            // therefore, we need to ensure that the tokenId was derived correctly
            // this only needs to be done the first time the PKP is registered

            // console.log("keypart1: ");
            // console.logBytes32(keyPart1);
            // console.log("keypart2: ");
            // console.logBytes32(keyPart2);

            bytes memory fullKey = combineKeyParts(
                keyPart1,
                keyPart2,
                keyLength
            );

            require(
                tokenId == uint256(keccak256(fullKey)),
                "tokenId does not match hashed keyParts"
            );
            pubkeyRegistrations[tokenId].routingData.keyPart1 = keyPart1;
            pubkeyRegistrations[tokenId].routingData.keyPart2 = keyPart2;
            pubkeyRegistrations[tokenId].routingData.keyLength = keyLength;
            pubkeyRegistrations[tokenId]
                .routingData
                .stakingContract = stakingContract;
            pubkeyRegistrations[tokenId].routingData.keyType = keyType;

            // set the threshold of votes to be the threshold of validators in the staking contract
            pubkeyRegistrations[tokenId]
                .nodeVoteThreshold = stakingContractInstance
                .validatorCountForConsensus();
        } else {
            // if this is not the first registration, validate that everything matches
            require(
                keyPart1 == pubkeyRegistrations[tokenId].routingData.keyPart1 &&
                    keyPart2 ==
                    pubkeyRegistrations[tokenId].routingData.keyPart2,
                "keyParts do not match"
            );

            // validate that the key length matches
            require(
                keyLength == pubkeyRegistrations[tokenId].routingData.keyLength,
                "keyLength does not match"
            );

            // validate that the staking contract matches
            require(
                stakingContract ==
                    pubkeyRegistrations[tokenId].routingData.stakingContract,
                "stakingContract does not match"
            );

            // validate that the key type matches
            require(
                keyType == pubkeyRegistrations[tokenId].routingData.keyType,
                "keyType does not match"
            );
        }

        pubkeyRegistrations[tokenId].votedNodes[msg.sender] = true;
        pubkeyRegistrations[tokenId].nodeVoteCount++;

        // if nodeVoteCount is greater than nodeVoteThreshold, set the routing data
        if (
            pubkeyRegistrations[tokenId].nodeVoteCount >
            pubkeyRegistrations[tokenId].nodeVoteThreshold &&
            !isRouted(tokenId)
        ) {
            pubkeys[tokenId].keyPart1 = keyPart1;
            pubkeys[tokenId].keyPart2 = keyPart2;
            pubkeys[tokenId].keyLength = keyLength;
            pubkeys[tokenId].stakingContract = stakingContract;
            pubkeys[tokenId].keyType = keyType;

            pkpNFT.pkpRouted(tokenId, keyType);

            emit PubkeyRoutingDataSet(
                tokenId,
                keyPart1,
                keyPart2,
                keyLength,
                stakingContract,
                keyType
            );
        }
    }

    /// Register an action if needed, and then permit it
    // function registerAndAddPermittedAction(
    //     uint256 tokenId,
    //     bytes32 digest,
    //     uint8 hashFunction,
    //     uint8 size
    // ) public {
    //     bytes32 ipfsIdHash = keccak256(
    //         abi.encodePacked(digest, hashFunction, size)
    //     );
    //     if (!isActionRegistered(ipfsIdHash)) {
    //         registerAction(digest, hashFunction, size);
    //     }
    //     addPermittedAction(tokenId, ipfsIdHash);
    // }

    // /// Save the full IPFS ID so we can go from hash(IPFS ID) -> IPFS ID
    // function registerAction(
    //     bytes32 digest,
    //     uint8 hashFunction,
    //     uint8 size
    // ) public {
    //     bytes32 ipfsIdHash = keccak256(
    //         abi.encodePacked(digest, hashFunction, size)
    //     );
    //     ipfsIds[ipfsIdHash].digest = digest;
    //     ipfsIds[ipfsIdHash].hashFunction = hashFunction;
    //     ipfsIds[ipfsIdHash].size = size;
    // }

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
        bytes memory userId
    ) public {
        // check that user is allowed to set this
        address nftOwner = pkpNFT.ownerOf(tokenId);
        require(
            msg.sender == nftOwner,
            "Only the PKP NFT owner can add and remove permitted auth methods"
        );

        AuthMethod memory am = AuthMethod(authMethodType, userId);
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

    /* ========== EVENTS ========== */

    event PubkeyRoutingDataSet(
        uint256 indexed tokenId,
        bytes32 keyPart1,
        bytes32 keyPart2,
        uint256 keyLength,
        address stakingContract,
        uint256 keyType
    );
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

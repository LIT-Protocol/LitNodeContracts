//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { PKPNFT } from "./PKPNFT.sol";
import { Staking } from "./Staking.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

import "hardhat/console.sol";

// TODO: make the tests send PKPNFT into the constructor
// TODO: test interaction between PKPNFT and this contract, like mint a keypair and see if you can access it
// TODO: setRoutingData() for a batch of keys

contract PubkeyRouter is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using BytesLib for bytes;

    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;

    struct PubkeyRoutingData {
        bytes pubkey;
        address stakingContract;
        uint256 keyType; // 1 = BLS, 2 = ECDSA.  Not doing this in an enum so we can add more keytypes in the future without redeploying.
    }

    struct PubkeyRegistrationProgress {
        PubkeyRoutingData routingData;
        uint256 nodeVoteCount;
        uint256 nodeVoteThreshold;
        mapping(address => bool) votedNodes;
    }

    // map the keccack256(uncompressed pubkey) -> PubkeyRoutingData
    mapping(uint256 => PubkeyRoutingData) public pubkeys;

    // this is used to count the votes from the nodes to register a key
    // map the keccack256(uncompressed pubkey) -> PubkeyRegistrationProgress
    mapping(uint256 => PubkeyRegistrationProgress) public pubkeyRegistrations;

    // map the eth address to a pkp id
    mapping(address => uint256) public ethAddressToPkpId;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft) {
        pkpNFT = PKPNFT(_pkpNft);
    }

    /* ========== VIEWS ========== */

    /// get the routing data for a given key hash
    function getRoutingData(uint256 tokenId)
        external
        view
        returns (PubkeyRoutingData memory)
    {
        return pubkeys[tokenId];
    }

    /// get if a given pubkey has routing data associated with it or not
    function isRouted(uint256 tokenId) public view returns (bool) {
        PubkeyRoutingData memory prd = pubkeys[tokenId];
        return
            prd.pubkey.length != 0 &&
            prd.keyType != 0 &&
            prd.stakingContract != address(0);
    }

    /// get the eth address for the keypair, as long as it's an ecdsa keypair
    function getEthAddress(uint256 tokenId) public view returns (address) {
        // only return addresses for ECDSA keys so that people don't
        // send funds to a BLS key that would be irretrieveably lost
        if (pubkeys[tokenId].keyType != 2) {
            return address(0);
        }
        // remove 0x04 prefix
        bytes memory pubkey = pubkeys[tokenId].pubkey.slice(1, 64);
        bytes32 hashed = keccak256(pubkey);
        return address(uint160(uint256(hashed)));
    }

    /// includes the 0x04 prefix so you can pass this directly to ethers.utils.computeAddress
    function getPubkey(uint256 tokenId) public view returns (bytes memory) {
        return pubkeys[tokenId].pubkey;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Set the pubkey and routing data for a given key hash
    // this is only used by an admin in case of emergency.  can prob be removed.
    function setRoutingData(
        uint256 tokenId,
        bytes memory pubkey,
        address stakingContract,
        uint256 keyType
    ) public onlyOwner {
        pubkeys[tokenId].pubkey = pubkey;
        pubkeys[tokenId].stakingContract = stakingContract;
        pubkeys[tokenId].keyType = keyType;

        pkpNFT.pkpRouted(tokenId, keyType);

        emit PubkeyRoutingDataSet(tokenId, pubkey, stakingContract, keyType);
    }

    /// vote to set the pubkey and routing data for a given key
    // FIXME this is vulnerable to an attack where the first node to call setRoutingData can set an incorrect stakingContract, or keyType, since none of those are validated.  Then, if more nodes try to call setRoutingData with the correct data, it will revert because it doesn't match.  Instead, it should probably be vote based.  so if 1 guy votes for an incorrect keyLength, it doesn't matter, because the one that gets the most votes wins.
    // FIXME this is also vulnerable to an attack where someone sets up their own staking contract with a threshold of 1 and then goes around claiming tokenIds and filling them with junk.  we probably need to verify that the staking contract is legit.  i'm not sure how to do that though.  like we can check various things from the staking contract, that the staked token is the real Lit token, and that the user has staked a significant amount.  But how do we know that staking contract isn't a custom fork that lies about all that stuff?  Maybe we need a mapping of valid staking contracts somewhere, and when we deploy a new one we add it manually.
    function voteForRoutingData(
        uint256 tokenId,
        bytes memory pubkey,
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

        // if this is the first registration, validate that the hashes match
        if (pubkeyRegistrations[tokenId].nodeVoteCount == 0) {
            // this is the only place where the tokenId could become decoupled from the pubkey.
            // therefore, we need to ensure that the tokenId was derived correctly
            // this only needs to be done the first time the PKP is registered

            require(
                tokenId == uint256(keccak256(pubkey)),
                "tokenId does not match hashed keyParts"
            );
            pubkeyRegistrations[tokenId].routingData.pubkey = pubkey;
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
                pubkey.length ==
                    pubkeyRegistrations[tokenId].routingData.pubkey.length &&
                    keccak256(pubkey) ==
                    keccak256(pubkeyRegistrations[tokenId].routingData.pubkey),
                "pubkey does not match previous registrations"
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
        emit PubkeyRoutingDataVote(
            tokenId,
            msg.sender,
            pubkey,
            stakingContract,
            keyType
        );

        // if nodeVoteCount is greater than nodeVoteThreshold, set the routing data
        if (
            pubkeyRegistrations[tokenId].nodeVoteCount >
            pubkeyRegistrations[tokenId].nodeVoteThreshold &&
            !isRouted(tokenId)
        ) {
            pubkeys[tokenId].pubkey = pubkey;
            pubkeys[tokenId].stakingContract = stakingContract;
            pubkeys[tokenId].keyType = keyType;

            // if this is an ECSDA key, then store the eth address reverse mapping
            if (keyType == 2) {
                address pkpAddress = getEthAddress(tokenId);
                ethAddressToPkpId[pkpAddress] = tokenId;
            }

            pkpNFT.pkpRouted(tokenId, keyType);

            emit PubkeyRoutingDataSet(
                tokenId,
                pubkey,
                stakingContract,
                keyType
            );
        }
    }

    function setPkpNftAddress(address newPkpNftAddress) public onlyOwner {
        pkpNFT = PKPNFT(newPkpNftAddress);
        emit PkpNftAddressSet(newPkpNftAddress);
    }

    /* ========== EVENTS ========== */

    event PubkeyRoutingDataSet(
        uint256 indexed tokenId,
        bytes pubkey,
        address stakingContract,
        uint256 keyType
    );
    event PubkeyRoutingDataVote(
        uint256 indexed tokenId,
        address indexed nodeAddress,
        bytes pubkey,
        address stakingContract,
        uint256 keyType
    );

    event PkpNftAddressSet(address newPkpNftAddress);
}

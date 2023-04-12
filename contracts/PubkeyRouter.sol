//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { PKPNFT } from "./PKPNFT.sol";
import { Staking } from "./Staking.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "hardhat/console.sol";

// TODO: make the tests send PKPNFT into the constructor
// TODO: test interaction between PKPNFT and this contract, like mint a keypair and see if you can access it
// TODO: setRoutingData() for a batch of keys

contract PubkeyRouter is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.UintSet;
    using BytesLib for bytes;

    /* ========== TYPE DEFINITIONS ========== */

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER");

    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;

    struct PubkeyRoutingData {
        bytes pubkey;
        address stakingContract;
        uint256 keyType; // 1 = BLS, 2 = ECDSA.  Not doing this in an enum so we can add more keytypes in the future without redeploying.
    }

    struct Signature {
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    // map the keccack256(uncompressed pubkey) -> PubkeyRoutingData
    mapping(uint256 => PubkeyRoutingData) public pubkeys;

    // map the eth address to a pkp id
    mapping(address => uint256) public ethAddressToPkpId;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft) {
        pkpNFT = PKPNFT(_pkpNft);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ROUTER_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ROUTER_ROLE, ADMIN_ROLE);
    }

    /* ========== VIEWS ========== */

    /// get the routing data for a given key hash
    function getRoutingData(
        uint256 tokenId
    ) external view returns (PubkeyRoutingData memory) {
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
        return deriveEthAddressFromPubkey(pubkeys[tokenId].pubkey);
    }

    /// includes the 0x04 prefix so you can pass this directly to ethers.utils.computeAddress
    function getPubkey(uint256 tokenId) public view returns (bytes memory) {
        return pubkeys[tokenId].pubkey;
    }

    function deriveEthAddressFromPubkey(
        bytes memory pubkey
    ) public pure returns (address) {
        // remove 0x04 prefix
        bytes32 hashed = keccak256(pubkey.slice(1, 64));
        return address(uint160(uint256(hashed)));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// register a pubkey and routing data for a given key hash
    // the person asking the nodes to generate the keys will collect signatures from them and then call this function to route the key

    // FIXME this is vulnerable to passing the same signature in 10 times.  we don't check that the sigs are unique, or that they're from independent nodes.
    // FIXME this is also vulnerable to an attack where someone sets up their own staking contract with a threshold of 1 and then goes around claiming tokenIds and filling them with junk.  we probably need to verify that the staking contract is legit.  i'm not sure how to do that though.  like we can check various things from the staking contract, that the staked token is the real Lit token, and that the user has staked a significant amount.  But how do we know that staking contract isn't a custom fork that lies about all that stuff?  Maybe we need a mapping of valid staking contracts somewhere, and when we deploy a new one we add it manually.
    function setRoutingData(
        uint256 tokenId,
        bytes memory pubkey,
        address stakingContractAddress,
        uint256 keyType,
        Signature[] memory signatures
    ) public {
        require(
            hasRole(ROUTER_ROLE, msg.sender),
            "PubkeyRouter: must have router role"
        );
        Staking stakingContract = Staking(stakingContractAddress);
        require(
            signatures.length ==
                stakingContract.getValidatorsInCurrentEpochLength(),
            "PubkeyRouter: incorrect number of signatures"
        );
        require(
            tokenId == uint256(keccak256(pubkey)),
            "tokenId does not match hashed pubkey"
        );
        require(
            !isRouted(tokenId),
            "PubkeyRouter: pubkey already has routing data"
        );

        // check the signatures
        for (uint256 i = 0; i < signatures.length; i++) {
            Signature memory sig = signatures[i];
            address signer = ECDSA.recover(
                ECDSA.toEthSignedMessageHash(pubkey),
                sig.v,
                sig.r,
                sig.s
            );
            // console.log("signer: ");
            // console.log(signer);
            require(
                stakingContract.isActiveValidatorByNodeAddress(signer),
                "PubkeyRouter: signer is not active validator"
            );
        }

        pubkeys[tokenId].pubkey = pubkey;
        pubkeys[tokenId].stakingContract = stakingContractAddress;
        pubkeys[tokenId].keyType = keyType;

        if (keyType == 2) {
            address pkpAddress = deriveEthAddressFromPubkey(pubkey);
            ethAddressToPkpId[pkpAddress] = tokenId;
        }

        pkpNFT.pkpRouted(tokenId, keyType);

        emit PubkeyRoutingDataSet(
            tokenId,
            pubkey,
            stakingContractAddress,
            keyType
        );
    }

    // a batch version of the above function
    function setRoutingDataBatch(
        uint256[] memory tokenIds,
        bytes[] memory _pubkeys,
        address stakingContract,
        uint256 keyType,
        Signature[][] memory signatures
    ) public {
        require(
            tokenIds.length == _pubkeys.length &&
                tokenIds.length == signatures.length,
            "PubkeyRouter: incorrect number of arguments"
        );
        for (uint256 i = 0; i < tokenIds.length; i++) {
            setRoutingData(
                tokenIds[i],
                _pubkeys[i],
                stakingContract,
                keyType,
                signatures[i]
            );
        }
    }

    /// Set the pubkey and routing data for a given key hash
    // this is only used by an admin in case of emergency.  can prob be removed.
    function setRoutingDataAsAdmin(
        uint256 tokenId,
        bytes memory pubkey,
        address stakingContract,
        uint256 keyType
    ) public {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "PubkeyRouter: must have admin role"
        );
        pubkeys[tokenId].pubkey = pubkey;
        pubkeys[tokenId].stakingContract = stakingContract;
        pubkeys[tokenId].keyType = keyType;

        if (keyType == 2) {
            address pkpAddress = deriveEthAddressFromPubkey(pubkey);
            ethAddressToPkpId[pkpAddress] = tokenId;
        }

        pkpNFT.pkpRouted(tokenId, keyType);

        emit PubkeyRoutingDataSet(tokenId, pubkey, stakingContract, keyType);
    }

    function setPkpNftAddress(address newPkpNftAddress) public {
        require(
            hasRole(ADMIN_ROLE, msg.sender),
            "PubkeyRouter: must have admin role"
        );
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

    event PkpNftAddressSet(address newPkpNftAddress);
}

//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { PubkeyRouter } from "./PubkeyRouter.sol";
import { PKPPermissions } from "./PKPPermissions.sol";
import { PKPNFTMetadata } from "./PKPNFTMetadata.sol";
import { ERC721Burnable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { Staking } from "./Staking.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

import "hardhat/console.sol";

// TODO: tests for the mintGrantAndBurn function, withdraw function, some of the setters, transfer function, freeMint and freeMintGrantAndBurn

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
/// or lit actions
contract SoloNetPKP is
    ERC721("Programmable Keypair", "PKP"),
    Ownable,
    ERC721Burnable,
    ERC721Enumerable,
    ReentrancyGuard
{
    using BytesLib for bytes;

    /* ========== STATE VARIABLES ========== */

    PKPPermissions public pkpPermissions;
    PKPNFTMetadata public pkpNftMetadata;
    uint256 public mintCost;
    address public freeMintSigner;
    Staking public staking;
    address public permittedMinter;

    // map tokenId to the actual pubkey
    mapping(uint256 => bytes) public pubkeys;

    // map the eth address to a pkp id
    mapping(address => uint256) public ethAddressToPkpId;

    mapping(uint256 => bool) public redeemedFreeMintIds;

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        mintCost = 1e14; // 0.0001 eth
        freeMintSigner = msg.sender;
        permittedMinter = msg.sender;
    }

    /* ========== VIEWS ========== */

    /// get the eth address for the keypair
    function getEthAddress(uint256 tokenId) public view returns (address) {
        // remove 0x04 prefix
        bytes memory pubkey = pubkeys[tokenId].slice(1, 64);
        bytes32 hashed = keccak256(pubkey);
        return address(uint160(uint256(hashed)));
    }

    /// includes the 0x04 prefix so you can pass this directly to ethers.utils.computeAddress
    function getPubkey(uint256 tokenId) public view returns (bytes memory) {
        return pubkeys[tokenId];
    }

    /// throws if the sig is bad or msg doesn't match
    function freeMintSigTest(
        uint256 freeMintId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view {
        bytes32 expectedHash = prefixed(
            keccak256(abi.encodePacked(address(this), freeMintId))
        );
        require(
            expectedHash == msgHash,
            "The msgHash is not a hash of the tokenId.  Explain yourself!"
        );

        // make sure it was actually signed by freeMintSigner
        address recovered = ecrecover(msgHash, v, r, s);
        require(
            recovered == freeMintSigner,
            "This freeMint was not signed by freeMintSigner.  How embarassing."
        );

        // prevent reuse
        require(
            redeemedFreeMintIds[freeMintId] == false,
            "This free mint ID has already been redeemed"
        );
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721, ERC721Enumerable) returns (bool) {
        return
            interfaceId == type(IERC721Enumerable).interfaceId ||
            interfaceId == type(IERC721Metadata).interfaceId ||
            interfaceId == type(IERC721).interfaceId;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721, ERC721Enumerable) {
        ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        console.log("getting token uri");
        bytes memory pubKey = getPubkey(tokenId);
        console.log("got pubkey, getting eth address");
        address ethAddress = getEthAddress(tokenId);
        console.log("calling tokenURI");

        return pkpNftMetadata.tokenURI(tokenId, pubKey, ethAddress);
    }

    // Builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function _getTokenIdToMint(
        bytes memory pubkey
    ) public view returns (uint256) {
        uint256 tokenId = uint256(keccak256(pubkey));
        require(pubkeys[tokenId].length == 0, "This pubkey already exists");
        return tokenId;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function mint(bytes memory pubkey) public payable returns (uint256) {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        require(tx.origin == permittedMinter, "You are not permitted to mint");

        uint256 tokenId = _getTokenIdToMint(pubkey);

        _mintWithoutValueCheck(pubkey, msg.sender);
        return tokenId;
    }

    function mintGrantAndBurn(
        bytes memory pubkey,
        bytes memory ipfsCID
    ) public payable returns (uint256) {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        require(tx.origin == permittedMinter, "You are not permitted to mint");

        uint256 tokenId = _mintWithoutValueCheck(pubkey, address(this));

        pkpPermissions.addPermittedAction(tokenId, ipfsCID, new uint256[](0));
        _burn(tokenId);
        return tokenId;
    }

    function freeMint(
        bytes memory pubkey,
        uint256 freeMintId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint256) {
        require(tx.origin == permittedMinter, "You are not permitted to mint");

        // this will panic if the sig is bad
        freeMintSigTest(freeMintId, msgHash, v, r, s);
        uint256 tokenId = _mintWithoutValueCheck(pubkey, msg.sender);
        redeemedFreeMintIds[freeMintId] = true;
        return tokenId;
    }

    function freeMintGrantAndBurn(
        bytes memory pubkey,
        uint256 freeMintId,
        bytes memory ipfsCID,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint256) {
        require(tx.origin == permittedMinter, "You are not permitted to mint");

        // this will panic if the sig is bad
        freeMintSigTest(freeMintId, msgHash, v, r, s);
        uint256 tokenId = _mintWithoutValueCheck(pubkey, address(this));
        redeemedFreeMintIds[freeMintId] = true;
        pkpPermissions.addPermittedAction(tokenId, ipfsCID, new uint256[](0));
        _burn(tokenId);
        return tokenId;
    }

    function _mintWithoutValueCheck(
        bytes memory pubkey,
        address to
    ) internal returns (uint256) {
        uint256 tokenId = uint256(keccak256(pubkey));
        require(pubkeys[tokenId].length == 0, "This pubkey already exists");
        pubkeys[tokenId] = pubkey;

        address pkpAddress = getEthAddress(tokenId);
        ethAddressToPkpId[pkpAddress] = tokenId;

        if (to == address(this)) {
            // permit unsafe transfer only to this contract, because it's going to be burned
            _mint(to, tokenId);
        } else {
            _safeMint(to, tokenId);
        }

        return tokenId;
    }

    function setStakingAddress(address stakingAddress) public onlyOwner {
        staking = Staking(stakingAddress);
        emit StakingAddressSet(stakingAddress);
    }

    function setPermittedMinter(address newPermittedMinter) public onlyOwner {
        permittedMinter = newPermittedMinter;
        emit PermittedMinterSet(permittedMinter);
    }

    function setPkpNftMetadataAddress(
        address pkpNftMetadataAddress
    ) public onlyOwner {
        pkpNftMetadata = PKPNFTMetadata(pkpNftMetadataAddress);
        emit PkpNftMetadataAddressSet(pkpNftMetadataAddress);
    }

    function setPkpPermissionsAddress(
        address pkpPermissionsAddress
    ) public onlyOwner {
        pkpPermissions = PKPPermissions(pkpPermissionsAddress);
        emit PkpPermissionsAddressSet(pkpPermissionsAddress);
    }

    function setMintCost(uint256 newMintCost) public onlyOwner {
        mintCost = newMintCost;
        emit MintCostSet(newMintCost);
    }

    function setFreeMintSigner(address newFreeMintSigner) public onlyOwner {
        freeMintSigner = newFreeMintSigner;
        emit FreeMintSignerSet(newFreeMintSigner);
    }

    function withdraw() public onlyOwner nonReentrant {
        uint256 withdrawAmount = address(this).balance;
        (bool sent, ) = payable(msg.sender).call{ value: withdrawAmount }("");
        require(sent);
        emit Withdrew(withdrawAmount);
    }

    /* ========== EVENTS ========== */

    event StakingAddressSet(address indexed stakingAddress);
    event PermittedMinterSet(address indexed permittedMinterAddress);
    event PkpNftMetadataAddressSet(address indexed pkpNftMetadataAddress);
    event PkpPermissionsAddressSet(address indexed pkpPermissionsAddress);
    event MintCostSet(uint256 newMintCost);
    event FreeMintSignerSet(address indexed newFreeMintSigner);
    event Withdrew(uint256 amount);
    event PkpRouted(uint256 indexed tokenId, uint256 indexed keyType);
}

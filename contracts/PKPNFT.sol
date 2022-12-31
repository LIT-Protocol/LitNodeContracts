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

import "hardhat/console.sol";

// TODO: tests for the mintGrantAndBurn function, withdraw function, some of the setters, transfer function, freeMint and freeMintGrantAndBurn

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
/// or lit actions
contract PKPNFT is
    ERC721("Programmable Keypair", "PKP"),
    Ownable,
    ERC721Burnable,
    ERC721Enumerable,
    ReentrancyGuard
{
    /* ========== STATE VARIABLES ========== */

    PubkeyRouter public router;
    PKPPermissions public pkpPermissions;
    PKPNFTMetadata public pkpNftMetadata;
    uint256 public mintCost;
    address public freeMintSigner;

    // maps keytype to array of unminted routed token ids
    mapping(uint256 => uint256[]) public unmintedRoutedTokenIds;

    mapping(uint256 => bool) public redeemedFreeMintIds;

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        mintCost = 1e14; // 0.0001 eth
        freeMintSigner = msg.sender;
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

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
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

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        console.log("getting token uri");
        bytes memory pubKey = router.getPubkey(tokenId);
        console.log("got pubkey, getting eth address");
        address ethAddress = router.getEthAddress(tokenId);
        console.log("calling tokenURI");

        return pkpNftMetadata.tokenURI(tokenId, pubKey, ethAddress);
    }

    function getUnmintedRoutedTokenIdCount(uint256 keyType)
        public
        view
        returns (uint256)
    {
        return unmintedRoutedTokenIds[keyType].length;
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

    /* ========== MUTATIVE FUNCTIONS ========== */

    function mintNext(uint256 keyType) public payable returns (uint256) {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        uint256 tokenId = _getNextTokenIdToMint(keyType);
        _mintWithoutValueCheck(tokenId, msg.sender);
        return tokenId;
    }

    function mintGrantAndBurnNext(uint256 keyType, bytes memory ipfsCID)
        public
        payable
        returns (uint256)
    {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        uint256 tokenId = _getNextTokenIdToMint(keyType);
        _mintWithoutValueCheck(tokenId, address(this));
        pkpPermissions.addPermittedAction(tokenId, ipfsCID, new uint256[](0));
        _burn(tokenId);
        return tokenId;
    }

    function freeMintNext(
        uint256 keyType,
        uint256 freeMintId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint256) {
        uint256 tokenId = _getNextTokenIdToMint(keyType);
        freeMint(freeMintId, tokenId, msgHash, v, r, s);
        return tokenId;
    }

    function freeMintGrantAndBurnNext(
        uint256 keyType,
        uint256 freeMintId,
        bytes memory ipfsCID,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint256) {
        uint256 tokenId = _getNextTokenIdToMint(keyType);
        freeMintGrantAndBurn(freeMintId, tokenId, ipfsCID, msgHash, v, r, s);
        return tokenId;
    }

    /// create a valid token for a given public key.
    function mintSpecific(uint256 tokenId) public onlyOwner {
        _mintWithoutValueCheck(tokenId, msg.sender);
    }

    /// mint a PKP, grant access to a Lit Action, and then burn the PKP
    /// this happens in a single txn, so it's provable that only that lit action
    /// has ever had access to use the PKP.
    /// this is useful in the context of something like a "prime number certification lit action"
    /// where you could just trust the sig that a number is prime.
    /// without this function, a user could mint a PKP, sign a bunch of junk, and then burn the
    /// PKP to make it looks like only the Lit Action can use it.
    function mintGrantAndBurnSpecific(uint256 tokenId, bytes memory ipfsCID)
        public
        onlyOwner
    {
        _mintWithoutValueCheck(tokenId, address(this));
        pkpPermissions.addPermittedAction(tokenId, ipfsCID, new uint256[](0));
        _burn(tokenId);
    }

    function freeMint(
        uint256 freeMintId,
        uint256 tokenId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        // this will panic if the sig is bad
        freeMintSigTest(freeMintId, msgHash, v, r, s);
        _mintWithoutValueCheck(tokenId, msg.sender);
        redeemedFreeMintIds[freeMintId] = true;
    }

    function freeMintGrantAndBurn(
        uint256 freeMintId,
        uint256 tokenId,
        bytes memory ipfsCID,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        // this will panic if the sig is bad
        freeMintSigTest(freeMintId, msgHash, v, r, s);
        _mintWithoutValueCheck(tokenId, address(this));
        redeemedFreeMintIds[freeMintId] = true;
        pkpPermissions.addPermittedAction(tokenId, ipfsCID, new uint256[](0));
        _burn(tokenId);
    }

    function _mintWithoutValueCheck(uint256 tokenId, address to) internal {
        require(router.isRouted(tokenId), "This PKP has not been routed yet");

        if (to == address(this)) {
            // permit unsafe transfer only to this contract, because it's going to be burned
            _mint(to, tokenId);
        } else {
            _safeMint(to, tokenId);
        }
    }

    /// Take a tokenId off the stack
    function _getNextTokenIdToMint(uint256 keyType) internal returns (uint256) {
        require(
            unmintedRoutedTokenIds[keyType].length > 0,
            "There are no unminted routed token ids to mint"
        );
        uint256 tokenId = unmintedRoutedTokenIds[keyType][
            unmintedRoutedTokenIds[keyType].length - 1
        ];

        unmintedRoutedTokenIds[keyType].pop();

        return tokenId;
    }

    function setRouterAddress(address routerAddress) public onlyOwner {
        router = PubkeyRouter(routerAddress);
        emit RouterAddressSet(routerAddress);
    }

    function setPkpNftMetadataAddress(address pkpNftMetadataAddress)
        public
        onlyOwner
    {
        pkpNftMetadata = PKPNFTMetadata(pkpNftMetadataAddress);
        emit PkpNftMetadataAddressSet(pkpNftMetadataAddress);
    }

    function setPkpPermissionsAddress(address pkpPermissionsAddress)
        public
        onlyOwner
    {
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

    /// Push a tokenId onto the stack
    function pkpRouted(uint256 tokenId, uint256 keyType) public {
        require(
            msg.sender == address(router),
            "Only the routing contract can call this function"
        );
        unmintedRoutedTokenIds[keyType].push(tokenId);
        emit PkpRouted(tokenId, keyType);
    }

    /* ========== EVENTS ========== */

    event RouterAddressSet(address indexed routerAddress);
    event PkpNftMetadataAddressSet(address indexed pkpNftMetadataAddress);
    event PkpPermissionsAddressSet(address indexed pkpPermissionsAddress);
    event MintCostSet(uint256 newMintCost);
    event FreeMintSignerSet(address indexed newFreeMintSigner);
    event Withdrew(uint256 amount);
    event PkpRouted(uint256 indexed tokenId, uint256 indexed keyType);
}

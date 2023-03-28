const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");
const {
    ipfsIdToIpfsIdHash,
    getBytes32FromMultihash,
    getBytesFromMultihash,
} = require("../utils.js");

describe("SoloNetPKP", function () {
    let deployer;
    let signers;
    let pkpContract;
    let pkpPermissions;
    let pkpNftMetadata;
    let minter;
    const fakeStakingContractAddress =
        "0x1eEE5bdDe12ff75B076D6F7Cbe76B5131120b07b";

    let PkpFactory;
    let PkpNftMetadataFactory;

    before(async () => {
        PkpFactory = await ethers.getContractFactory("SoloNetPKP");
        PkpPermissionsFactory = await ethers.getContractFactory(
            "PKPPermissions"
        );
        PkpNftMetadataFactory = await ethers.getContractFactory(
            "PKPNFTMetadata"
        );
    });

    beforeEach(async () => {
        [deployer, minter, ...signers] = await ethers.getSigners();
    });

    beforeEach(async () => {
        pkpContract = await PkpFactory.deploy();
        pkpPermissions = await PkpPermissionsFactory.deploy(
            pkpContract.address
        );
        pkpNftMetadata = await PkpNftMetadataFactory.deploy();
        await pkpContract.setStakingAddress(fakeStakingContractAddress);
        await pkpContract.setPkpPermissionsAddress(pkpPermissions.address);
        await pkpContract.setPkpNftMetadataAddress(pkpNftMetadata.address);
        await pkpContract.addPermittedMinter(minter.address);
    });

    describe("Attempt to Mint PKP NFT", async () => {
        let recipient;
        beforeEach(async () => ([recipient, ...signers] = signers));
        beforeEach(async () => (pkpContract = pkpContract.connect(minter)));

        let pubkey =
            "0x044028212ea31584733e183cc92b2c5306ff29bd26693698875e19e329f19cf2e0be4383fc28f63269619067d2369fbb0877f11158efe30ea1b17ffd07b5cde887";
        const pubkeyHash = ethers.utils.keccak256(pubkey);
        const tokenId = ethers.BigNumber.from(pubkeyHash);
        //console.log("PubkeyHash: " , pubkeyHash);

        it("refuses to mint for free", async () => {
            expect(pkpContract.mint(pubkey)).revertedWith(
                "You must pay exactly mint cost"
            );
        });

        it("refuses to mint because the user is not the permittedMinter", async () => {
            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            const pkpContractWithRecipient = pkpContract.connect(recipient);

            expect(
                pkpContractWithRecipient.mint(pubkey, transaction)
            ).revertedWith("You are not permitted to mint");
        });

        it("mints successfully", async () => {
            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            await pkpContract.mint(pubkey, transaction);

            // check the token was minted
            const owner = await pkpContract.ownerOf(tokenId);
            expect(owner).to.equal(minter.address);

            // check the metadata
            const pkpEthAddress = await pkpContract.getEthAddress(tokenId);

            const tokenUri = await pkpContract.tokenURI(tokenId);
            // console.log("tokenUri", tokenUri);
            const metadata = tokenUri.substring(29);
            const decodedUint8Array = ethers.utils.base64.decode(metadata);
            const decoded = ethers.utils.toUtf8String(decodedUint8Array);
            // console.log("decoded", decoded);
            const parsed = JSON.parse(decoded);
            // console.log("parsed", parsed);

            expect(parsed["name"]).to.equal("Lit PKP #" + tokenId.toString());
            expect(parsed["attributes"][0]["value"]).to.equal(pubkey);
            expect(parsed["attributes"][1]["value"].toLowerCase()).to.equal(
                pkpEthAddress.toLowerCase()
            );
            expect(parsed["attributes"][2]["value"]).to.equal(
                tokenId.toString()
            );
        });
    });

    describe("Test free minting of PKP NFT", async () => {
        let admin;

        let pubkey =
            "0x04fde9eaa7f4aa2bc89c1ae37a0a685b9340b3f7deff76550f766609eac9f7e5881c4b0b7bc3b2d3680a86c96223556914c7ef806800f976097705415e78304f98";
        const pubkeyHash = ethers.utils.keccak256(pubkey);
        // console.log("pubkeyhash: ", pubkeyHash);
        const tokenId = ethers.BigNumber.from(pubkeyHash);
        //console.log("PubkeyHash: " , pubkeyHash);

        beforeEach(async () => ([admin, ...signers] = signers));
        beforeEach(async () => {
            pkpContract = pkpContract.connect(deployer);
            await pkpContract.setFreeMintSigner(admin.address);
            pkpContract = pkpContract.connect(minter);
        });

        it("refuses to mint with an empty sig", async () => {
            const freeMintId = 12345;

            // test with empty sig
            expect(
                pkpContract.freeMint(
                    pubkey,
                    freeMintId,
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    0,
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000000"
                )
            ).revertedWith(
                "The msgHash is not a hash of the tokenId.  Explain yourself!"
            );
        });

        it("checks the signature for a free mint", async () => {
            const freeMintId = 12345;

            // sign for real
            const toSign = ethers.utils.solidityKeccak256(
                ["address", "uint256"],
                [pkpContract.address, freeMintId]
            );
            let sig = await admin.signMessage(ethers.utils.arrayify(toSign));
            console.log("sig", sig);

            const r = sig.slice(0, 66);
            const s = "0x" + sig.slice(66, 130);
            const v = "0x" + sig.slice(130, 132);

            console.log("r: ", r);
            console.log("s: ", s);
            console.log("v: ", v);

            const msgHash = ethers.utils.solidityKeccak256(
                ["string", "bytes32"],
                ["\x19Ethereum Signed Message:\n32", toSign]
            );

            // mint ECDSA key
            await pkpContract.freeMint(pubkey, freeMintId, msgHash, v, r, s);
        });
    });

    describe("Test Mint Grant And Burn", async () => {
        let recipient;
        beforeEach(async () => ([recipient, ...signers] = signers));
        beforeEach(async () => (pkpContract = pkpContract.connect(minter)));

        let pubkey =
            "0x04c5c4c5762982cd8364174385eab907c839be7ce9b09488f6f4d194a701dad1be1f1055c7bda56591ab0d3b7752f69a0c4a42d6616c6f5e2d172db5a60532714e";
        const pubkeyHash = ethers.utils.keccak256(pubkey);
        const tokenId = ethers.BigNumber.from(pubkeyHash);
        //console.log("PubkeyHash: " , pubkeyHash);

        it("mints, grants, and burns successfully", async () => {
            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            const ipfsIdToPermit =
                "QmW6uH8p17DcfvZroULkdEDAKThWzEDeNtwi9oezURDeXN";
            // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
            const ipfsIdBytes = getBytesFromMultihash(ipfsIdToPermit);
            // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);

            // await router.registerAction(
            //   multihashStruct.digest,
            //   multihashStruct.hashFunction,
            //   multihashStruct.size
            // );

            await pkpContract.mintGrantAndBurn(
                pubkey,
                ipfsIdBytes,
                transaction
            );

            // check the token was minted
            expect(pkpContract.ownerOf(tokenId)).revertedWith(
                "ERC721: invalid token ID"
            );

            const actionIsPermitted = await pkpPermissions.isPermittedAction(
                tokenId,
                ipfsIdBytes
            );

            expect(actionIsPermitted).to.equal(true);
        });
    });
});

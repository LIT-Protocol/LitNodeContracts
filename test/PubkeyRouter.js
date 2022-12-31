const { expect } = require("chai");
const {
    ipfsIdToIpfsIdHash,
    getBytes32FromMultihash,
    getBytesFromMultihash,
} = require("../utils.js");
const { smock } = require("@defi-wonderland/smock");

describe("PubkeyRouter", function () {
    let deployer;
    let signers;
    let routerContract;
    let pkpContract;
    let stakingContract;
    let tokenContract;

    before(async () => {
        const RouterContractFactory = await ethers.getContractFactory(
            "PubkeyRouter"
        );
        const PKPContractFactory = await ethers.getContractFactory("PKPNFT");
        // mock the staking contract so we can get it into the state we need
        const StakingContractFactory = await smock.mock("Staking");
        const TokenContractFactory = await ethers.getContractFactory(
            "LITToken"
        );

        [deployer, ...signers] = await ethers.getSigners();

        pkpContract = await PKPContractFactory.deploy();
        routerContract = await RouterContractFactory.deploy(
            pkpContract.address
        );
        tokenContract = await TokenContractFactory.deploy();

        await pkpContract.setRouterAddress(routerContract.address);

        stakingContract = await StakingContractFactory.deploy(
            tokenContract.address
        );

        stakingContract.isActiveValidator.returns(true);
        stakingContract.validatorCountForConsensus.returns(0);
    });

    describe("store and retrieve routing data", async () => {
        let fakePubkey =
            "0x83709b8bcc865ce02b7a918909936c8fbc3520445634dcaf4a18cfa1f0218a5ca37173aa265defedad866a0ae7b6c301";

        context("when routing data is unset", async () => {
            beforeEach(async () => {
                routerContract = routerContract.connect(deployer);
            });

            it("retrieves empty routing data", async () => {
                const pubkeyHash = ethers.utils.keccak256(fakePubkey);
                const [pubkey, stakingContract, keyType] =
                    await routerContract.getRoutingData(pubkeyHash);
                expect(pubkey).equal("0x");
                expect(stakingContract).equal(
                    "0x0000000000000000000000000000000000000000"
                );
                expect(keyType).equal(0);
            });
        });

        context("when routing data is set", async () => {
            beforeEach(async () => {
                routerContract = await routerContract.connect(deployer);
                pkpContract = await pkpContract.connect(deployer);
            });

            it("sets and retrieves routing data", async () => {
                const pubkeyHash = ethers.utils.keccak256(fakePubkey);

                // validate that it's unset
                const [pubkeyBefore, stakingContractAddressBefore, keyType] =
                    await routerContract.getRoutingData(pubkeyHash);
                expect(pubkeyBefore).equal("0x");
                expect(stakingContractAddressBefore).equal(
                    "0x0000000000000000000000000000000000000000"
                );
                expect(keyType).equal(0);

                // set routing data
                const keyTypeInput = 1;

                await routerContract.voteForRoutingData(
                    pubkeyHash,
                    fakePubkey,
                    stakingContract.address,
                    keyTypeInput
                );

                // validate that it was set
                const [pubkeyAfter, stakingContractAddressAfter, keyTypeAfter] =
                    await routerContract.getRoutingData(pubkeyHash);
                expect(pubkeyAfter).equal(fakePubkey);
                expect(stakingContractAddressAfter).equal(
                    stakingContract.address
                );
                expect(keyTypeAfter).equal(keyTypeInput);
            });
        });
    });

    describe("register a PKP and set routing permissions", async () => {
        context("when the PKP is minted, check the ETH address", async () => {
            // 64 byte pubkey - the max size we support
            let fakePubkey =
                "0x046db7b0736408e7874b746f6d54aa6e4d04fd8902b520af69493f62757e77e0b5247355f925af2b382b64c71fcb3ff3ad26469ca65b4d2945d6e6379a4f285b93";
            let tester;
            let creator;
            let tokenId;

            before(async () => {
                [creator, tester, ...signers] = signers;

                routerContract = await routerContract.connect(deployer);

                // check that the routing data for this pubkey is empty
                const pubkeyHash = ethers.utils.keccak256(fakePubkey);
                const [pubkeyBefore, stakingContractAddressBefore, keyType] =
                    await routerContract.getRoutingData(pubkeyHash);
                expect(pubkeyBefore).equal("0x");
                expect(stakingContractAddressBefore).equal(
                    "0x0000000000000000000000000000000000000000"
                );
                expect(keyType).equal(0);

                const keyTypeInput = 2;

                await routerContract.voteForRoutingData(
                    pubkeyHash,
                    fakePubkey,
                    stakingContract.address,
                    keyTypeInput
                );

                // validate that it was set
                const [pubkeyAfter, stakingContractAddressAfter, keyTypeAfter] =
                    await routerContract.getRoutingData(pubkeyHash);
                expect(pubkeyAfter).equal(fakePubkey);
                expect(stakingContractAddressAfter).equal(
                    stakingContract.address
                );
                expect(keyTypeAfter).equal(keyTypeInput);

                tokenId = ethers.BigNumber.from(pubkeyHash);

                // mint the PKP to the tester account
                pkpContract = await pkpContract.connect(tester);
                // send eth with the txn
                const mintCost = await pkpContract.mintCost();
                const transaction = {
                    value: mintCost,
                };
                await pkpContract.mintNext(2, transaction);
                const owner = await pkpContract.ownerOf(pubkeyHash);
                expect(owner).equal(tester.address);
            });

            it("checks the PKP eth address and the reverse mapping", async () => {
                // validate that the address matches what ethers calculates
                console.log("fakePubkey", fakePubkey);
                const ethersResult = ethers.utils.computeAddress(fakePubkey);
                console.log("ethersResult", ethersResult);
                const pubkeyFromContract = await routerContract.getPubkey(
                    tokenId
                );
                console.log("pubkeyFromContract", pubkeyFromContract);
                let ethAddressOfPKP = await routerContract.getEthAddress(
                    tokenId
                );
                console.log("ethAddressOfPKP", ethAddressOfPKP);
                expect(ethAddressOfPKP).equal(ethersResult);
                expect(fakePubkey).equal(pubkeyFromContract);

                // check the reverse mapping
                const tokenIdFromContract =
                    await routerContract.ethAddressToPkpId(ethAddressOfPKP);
                expect(tokenIdFromContract).equal(tokenId);
            });
        });
    });
});

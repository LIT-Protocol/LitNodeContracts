const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");

describe("RateLimitNFT", function () {
    let deployer;
    let signers;
    let rateLimitNFTContract;

    let RateLimitNFTFactory;

    before(async () => {
        RateLimitNFTFactory = await ethers.getContractFactory("RateLimitNFT");
    });

    beforeEach(async () => {
        [deployer, ...signers] = await ethers.getSigners();
    });

    beforeEach(async () => {
        rateLimitNFTContract = await RateLimitNFTFactory.deploy();
    });

    // describe("Attempt to Mint Rate Limit NFT", async () => {
    //     let minter;

    //     beforeEach(async () => ([minter, recipient, ...signers] = signers));
    //     beforeEach(
    //         async () =>
    //             (rateLimitNFTContract = rateLimitNFTContract.connect(minter))
    //     );

    //     let now = Date.now();
    //     // tomorrow
    //     let expiresAt = ethers.BigNumber.from(now + 1000 * 60 * 60 * 24);

    //     it("refuses to mint for less then the real cost", async () => {
    //         expect(
    //             rateLimitNFTContract.mint(expiresAt, {
    //                 value: ethers.BigNumber.from(1000),
    //             })
    //         ).revertedWith(
    //             "You must send the cost of this rate limit increase.  To check the cost, use the calculateCost function."
    //         );
    //     });
    // });

    describe("Test free minting of Rate Limit NFT", async () => {
        let minter;
        let admin;

        beforeEach(async () => ([minter, admin, ...signers] = signers));

        it("checks the signature for a free mint", async () => {
            let now = Date.now();
            // tomorrow
            let expiresAt = ethers.BigNumber.from(now + 1000 * 60 * 60 * 24);
            let requestsPerKilosecond = ethers.BigNumber.from(1000);

            rateLimitNFTContract = rateLimitNFTContract.connect(deployer);
            await rateLimitNFTContract.setFreeMintSigner(admin.address);

            // test with empty sig
            expect(
                rateLimitNFTContract.freeMint(
                    expiresAt,
                    requestsPerKilosecond,
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    0,
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000000"
                )
            ).revertedWith(
                "The msgHash is not a hash of the expiresAt + requestsPerKilosecond.  Explain yourself!"
            );
        });
    });

    describe("Test minting costs and params of Rate Limit NFT", async () => {
        let minter;
        let admin;

        beforeEach(async () => ([minter, admin, ...signers] = signers));

        it("mints a rate limit increase nft and checks the params", async () => {
            // we would like 1 request per kilosecond, which is 1 request per 1000 seconds.
            const requestsPerKilosecond = ethers.BigNumber.from(1);
            // this should be set to 1,000,000 wei
            const additionalRequestsPerKilosecondCost =
                await rateLimitNFTContract.additionalRequestsPerKilosecondCost();
            expect(additionalRequestsPerKilosecondCost).to.equal(1000000);

            // 100 seconds from now
            // get block timestamp
            let block = await ethers.provider.getBlock("latest");
            let timestamp = ethers.BigNumber.from(block.timestamp);
            // console.log("block.timestamp: ", block.timestamp.toString());
            const expirationTimeInSecondsFromNow = 100;
            let expiresAt = timestamp.add(
                ethers.BigNumber.from(expirationTimeInSecondsFromNow)
            );

            // calculate the cost manually
            const manualCost = additionalRequestsPerKilosecondCost
                .mul(requestsPerKilosecond)
                .mul(ethers.BigNumber.from(expirationTimeInSecondsFromNow))
                .div(1000);
            // console.log("manualCost: ", manualCost.toString());

            const cost = await rateLimitNFTContract.calculateCost(
                requestsPerKilosecond,
                expiresAt
            );
            // console.log("cost: ", cost.toString());
            // each additional kilosecond costs 1,000,000 wei, aka 1000 for each additional second
            // we're asking for 1 request per kilosecond, aka 0.001 requests per second
            // for 100 seconds, so we need to pay 100 seconds * 1000 for each second = 100,000 wei
            expect(cost).to.equal(ethers.BigNumber.from(100000));

            // let's sanity check the opposite calculation
            const requestsPerKilosecondFromContract =
                await rateLimitNFTContract.calculateRequestsPerKilosecond(
                    cost,
                    expiresAt
                );

            expect(requestsPerKilosecondFromContract).to.equal(
                requestsPerKilosecond
            );

            block = await ethers.provider.getBlock("latest");
            timestamp = ethers.BigNumber.from(block.timestamp);
            expiresAt = timestamp.add(expirationTimeInSecondsFromNow);
            // send eth with the txn
            let res = await rateLimitNFTContract.mint(expiresAt, {
                value: cost,
            });
            let receipt = await res.wait();
            // console.log("receipt", JSON.stringify(receipt));

            // get the tokenId from the event
            let tokenId = receipt.events[0].topics[3];
            // console.log("tokenId", tokenId.toString());

            // check the params
            let capacity = await rateLimitNFTContract.capacity(tokenId);
            // console.log("capacity", capacity.toString());
            expect(capacity[0]).to.equal(requestsPerKilosecond);
            expect(capacity[1]).to.equal(expiresAt);
        });

        it("tries to mint with some bad params", async () => {
            // we would like 10 request per kilosecond, which is 10 request per 1000 seconds.
            const requestsPerKilosecond = ethers.BigNumber.from(10);
            // this should be set to 1,000,000 wei
            const additionalRequestsPerKilosecondCost =
                await rateLimitNFTContract.additionalRequestsPerKilosecondCost();
            expect(additionalRequestsPerKilosecondCost).to.equal(1000000);

            // 100 seconds from now
            // get block timestamp
            let block = await ethers.provider.getBlock("latest");
            let timestamp = ethers.BigNumber.from(block.timestamp);
            // console.log("block.timestamp: ", block.timestamp.toString());
            const expirationTimeInSecondsFromNow = 10000;
            let expiresAt = timestamp.add(
                ethers.BigNumber.from(expirationTimeInSecondsFromNow)
            );
            const cost = await rateLimitNFTContract.calculateCost(
                requestsPerKilosecond,
                expiresAt
            );

            const belowCost = cost.sub(ethers.BigNumber.from(20000000));

            // now let's try to mint with too little.  minting should work
            // but the rate limit increase nft should have a smaller rate limit increase
            let res = await rateLimitNFTContract.mint(expiresAt, {
                value: belowCost,
            });
            let receipt = await res.wait();
            // get the tokenId from the event
            let tokenId = receipt.events[0].topics[3];

            // check the params
            let capacity = await rateLimitNFTContract.capacity(tokenId);
            // console.log("capacity", capacity.toString());
            expect(capacity[0]).to.be.below(requestsPerKilosecond);
            expect(capacity[1]).to.equal(expiresAt);

            // try to trick it with tiny numbers
            expect(
                rateLimitNFTContract.mint(timestamp.add(10), {
                    value: ethers.BigNumber.from(1),
                })
            ).revertedWith("The requestsPerKilosecond must be greater than 0");
        });
    });
});

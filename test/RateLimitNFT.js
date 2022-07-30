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

  describe("Attempt to Mint Rate Limit NFT", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(
      async () => (rateLimitNFTContract = rateLimitNFTContract.connect(minter))
    );

    let now = Date.now();
    // tomorrow
    let expiresAt = ethers.BigNumber.from(now + 1000 * 60 * 60 * 24);

    it("refuses to mint for free", async () => {
      expect(rateLimitNFTContract.mint(expiresAt)).revertedWith(
        "You must send the cost of this rate limit increase.  To check the cost, use the calculateCost function."
      );
    });
  });

  describe("Test free minting of Rate Limit NFT", async () => {
    let minter;
    let admin;

    beforeEach(async () => ([minter, admin, ...signers] = signers));

    it("checks the signature for a free mint", async () => {
      let now = Date.now();
      // tomorrow
      let expiresAt = ethers.BigNumber.from(now + 1000 * 60 * 60 * 24);
      let requestsPerMillisecond = ethers.BigNumber.from(1000);

      rateLimitNFTContract = rateLimitNFTContract.connect(deployer);
      await rateLimitNFTContract.setFreeMintSigner(admin.address);

      // test with empty sig
      expect(
        rateLimitNFTContract.freeMint(
          expiresAt,
          requestsPerMillisecond,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        )
      ).revertedWith(
        "The msgHash is not a hash of the expiresAt + requestsPerMillisecond.  Explain yourself!"
      );

      // sign for real
      // let sig = await admin.signMessage(pubkeyHash);
      // console.log("sig", sig);
    });

    // it("refuses to mint because the PKP isnt routed yet", async () => {
    //   // send eth with the txn
    //   const mintCost = await rateLimitNFTContract.mintCost();
    //   const transaction = {
    //     value: mintCost,
    //   };

    //   expect(rateLimitNFTContract.mint(tokenId, transaction)).revertedWith(
    //     "This PKP has not been routed yet"
    //   );
    // });
  });
});

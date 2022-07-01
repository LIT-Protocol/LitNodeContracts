const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PKPNFT", function () {
  let deployer;
  let signers;
  let pkpContract;
  let router;

  let PkpFactory;
  let RouterFactory;

  before(async () => {
    PkpFactory = await ethers.getContractFactory("PKPNFT");
    RouterFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    pkpContract = await PkpFactory.deploy();
    router = await RouterFactory.deploy(pkpContract.address);
    await pkpContract.setRouterAddress(router.address);
  });

  describe("Attempt to Mint PKP NFT", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(async () => (pkpContract = pkpContract.connect(minter)));

    let pubkey =
      "0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    const tokenId = ethers.BigNumber.from(pubkeyHash);
    //console.log("PubkeyHash: " , pubkeyHash);

    it("refuses to mint for free", async () => {
      expect(pkpContract.mint(tokenId)).revertedWith(
        "You must pay exactly mint cost"
      );
    });

    it("refuses to mint because the PKP isnt routed yet", async () => {
      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      expect(pkpContract.mint(tokenId, transaction)).revertedWith(
        "This PKP has not been routed yet"
      );
    });
  });
});

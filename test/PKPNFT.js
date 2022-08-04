const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");

describe("PKPNFT", function () {
  let deployer;
  let signers;
  let pkpContract;
  let router;

  let PkpFactory;
  let RouterFactory;

  before(async () => {
    PkpFactory = await ethers.getContractFactory("PKPNFT");
    RouterFactory = await smock.mock("PubkeyRouterAndPermissions");
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

  describe("Test free minting of PKP NFT", async () => {
    let minter;
    let admin;

    let pubkey =
      "0x79ad3ad10f47993173e69e040a2e5299060bd531f4d5632b45a1b56f6dc17f9d";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    console.log("pubkeyhash: ", pubkeyHash);
    const tokenId = ethers.BigNumber.from(pubkeyHash);
    //console.log("PubkeyHash: " , pubkeyHash);

    beforeEach(async () => ([minter, admin, ...signers] = signers));
    beforeEach(async () => {
      await router.setRoutingData(
        tokenId,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
        48,
        "0x0000000000000000000000000000000000000003",
        2
      );
    });
    beforeEach(async () => {
      pkpContract = pkpContract.connect(deployer);
      await pkpContract.setFreeMintSigner(admin.address);
    });

    it("refuses to mint with an empty sig", async () => {
      const freeMintId = 12345;

      // test with empty sig
      expect(
        pkpContract.freeMint(
          freeMintId,
          tokenId,
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

      await pkpContract.freeMintNext(2, freeMintId, msgHash, v, r, s);
    });

    // it("refuses to mint because the PKP isnt routed yet", async () => {
    //   // send eth with the txn
    //   const mintCost = await pkpContract.mintCost();
    //   const transaction = {
    //     value: mintCost,
    //   };

    //   expect(pkpContract.mint(tokenId, transaction)).revertedWith(
    //     "This PKP has not been routed yet"
    //   );
    // });
  });
});

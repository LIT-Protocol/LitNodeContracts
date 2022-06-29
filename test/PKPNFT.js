const { expect } = require("chai");

describe("PKPNFT", function () {
  let deployer;
  let signers;
  let token;
  let router;

  let TokenFactory;
  let RouterFactory;

  before(async () => {
    TokenFactory = await ethers.getContractFactory("PKPNFT");
    RouterFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    token = await TokenFactory.deploy();
    router = await RouterFactory.deploy(token.address);
    await token.setRouterAddress(router.address);
  });

  describe("Attempt to Mint PKP NFT", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(async () => (token = token.connect(minter)));

    let pubkey =
      "0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    //console.log("PubkeyHash: " , pubkeyHash);

    it("refuses to mint because the PKP isnt routed yet", async () => {
      expect(token.mint(pubkey)).revertedWith(
        "This PKP has not been routed yet"
      );
    });
  });
});

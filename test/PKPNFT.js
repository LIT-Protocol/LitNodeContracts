const { expect } = require('chai')

describe('PKPNFT', function () {
  let deployer;
  let signers;
  let token;

  let TokenFactory;

  before(async () => {
    TokenFactory = await ethers.getContractFactory('PKPNFT')
  })

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  })

  beforeEach(async () => {
    token = await TokenFactory.deploy();
  })

  describe('Mint PKP NFT', async () => {
    let minter

    beforeEach(async () => [minter, recipient, ...signers] = signers)
    beforeEach(async () => token = token.connect(minter))

    const pubkey = '0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a';
    const hash_pubkey = '0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a';
    it('mints tokens', async () => {
      const tokenId = await token.mint(pubkey);
      console.log("tokenid: " , tokenId);
      expect(tokenId).equal( hash_pubkey);
    })
  })
})

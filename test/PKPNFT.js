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

    let pubkey = '0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a';       
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    //console.log("PubkeyHash: " , pubkeyHash);

    it('mints tokens', async () => {
      const txn = await token.mint(pubkey);
      const tx = await txn.wait(); 

      const event = tx.events[0];
      const value = event.args[2];
      const tokenId = value; 
      expect(tokenId).to.equal( pubkeyHash);  // comparing the hash to the tokenId seems to convert to BigNumber for us!
    })

    
  })
})
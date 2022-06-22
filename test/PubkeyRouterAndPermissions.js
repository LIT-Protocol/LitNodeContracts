const { expect } = require("chai");

describe("PubkeyRouter", function () {
  let deployer;
  let signers;
  let routerContract;

  let RouterContractFactory;
  let TokenContractFactory;
  let TokenContract;
  let pubkey = '0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a';       

  before(async () => {
    RouterContractFactory = await ethers.getContractFactory("PubkeyRouterAndPermissions");
    TokenContractFactory = await ethers.getContractFactory("PKPNFT");

    [deployer, ...signers] = await ethers.getSigners();

    TokenContract = await TokenContractFactory.deploy();
    await TokenContract.connect(deployer);
    const txn = await TokenContract.mint(pubkey);    
    const tx = await txn.wait(); 

    // console.log('tx:', tx);
    // console.log('tx.events:', tx.events);

    const event = tx.events[0];
    const tokenId = event.args[2];
    const token_address = event.address;
    routerContract = await RouterContractFactory.deploy(TokenContract.address);

  });



  describe("store and retrieve routing data", async () => {
    context("when routing data is unset", async () => {
      let creator;
      let tester;

      beforeEach(async () => {
        [creator, tester, ...signers] = signers;
        routerContract = routerContract.connect(creator);
      });

      it("retrieves empty routing data", async () => {
        let fake_pubkey = '0x0437891234581f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a';       

        const pubkeyHash = ethers.utils.keccak256(fake_pubkey);
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);
      });
    });

    context("when routing data is set", async () => {
      beforeEach(async () => {
        routerContract = await routerContract.connect(deployer);
        TokenContract = await TokenContract.connect(deployer);
      });

      it("sets and retrieves routing data", async () => {
          const pubkeyHash = ethers.utils.keccak256(pubkey);

        // validate that it's unset
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        // set routing data
        const keyPart1Bytes = ethers.utils.hexDataSlice(pubkeyHash, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(pubkeyHash, 32),
          32
        );

        const stakingContractAddress =
          "0x6cB3Cd5064692ac8e3368A1d6C29b36aE1143dF7"; // a random address
        const keyLengthInput = 48;
        const keyTypeInput = 1;

        await routerContract.setRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContractAddress,
          keyTypeInput
        );

        // validate that it was set
        const [
          keyPart1After,
          keyPart2After,
          keyLengthAfter,
          stakingContractAfter,
          keyTypeAfter,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1After).equal(keyPart1Bytes);
        expect(keyPart2After).equal(keyPart2Bytes);
        expect(keyLengthAfter).equal(keyLengthInput);
        expect(stakingContractAfter).equal(stakingContractAddress);
        expect(keyTypeAfter).equal(keyTypeInput);
      });
    });
  });
});

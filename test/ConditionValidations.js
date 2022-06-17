const { expect } = require("chai");

describe("ConditionValidations", async ()  => {
  let signers;
  let contract;
  let deployer;

  // const publicKey = "0x02d285b90c267b448b9b521709d0cc980ff03c3e4b1dd0e844bb4b9de85a677fc9";
  // const publicKeyNoHdr = "0xd285b90c267b448b9b521709d0cc980ff03c3e4b1dd0e844bb4b9de85a677fc9";
  const ownerAddress = "0x804C96C9750a57FB841f26a7bC9f2815782D8529";
  /// let ContractFactory;
  before(async () => {
    ContractFactory = await ethers.getContractFactory(
      "ConditionValidations"
    );
  });


  /// deploy contract
  beforeEach(async () => {
    contract = await ContractFactory.deploy(  ownerAddress);
  });

  // get signers
  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });


  // this test is a bit useless right now - once the public key needs to be used as the constructor argument
  // describe("validate owner", async () => {
  //   it ("owner address is correct", async () => {
  //     const owner = await contract.getOwnerAddress();
  //     expect(owner).equal('0x804C96C9750a57FB841f26a7bC9f2815782D8529');
  //   });
  // });


  describe("test public key to address conversion", async() => {
      const publicKey = "0x02d285b90c267b448b9b521709d0cc980ff03c3e4b1dd0e844bb4b9de85a677fc9";
      const publicKeyNoHdr = "0xd285b90c267b448b9b521709d0cc980ff03c3e4b1dd0e844bb4b9de85a677fc9";
                              
      //0x804C96C9750a57FB841f26a7bC9f2815782D8529
      //0xA87A5D6818BeC94689Dc8Df976e57164808ef843
      it ("public key to address", async() => {
        const decodedAddress = await contract.testPubKeyToAddress(publicKeyNoHdr);
        expect(ownerAddress).equal(decodedAddress);
      })
  })


  // describe storing a validation
  describe("store & retreive validation", async () => {

    /// bad signature - not signed by LIT
    // context("when signature is invalid", async () => {
    //   const chainId = 1;
    //   const conditionHash = "0x0aeaaf72a19e6bdbb7534082576e4cd768b073934326638b64faf8289113e177";
    //   const signature = "0xa731ac27fd1386c0f09b70b8359e605f5e33f6d68126adc9dd123cd94c512db2752e316ad925c932ffd4331b4b7b16bc52647a55151c0dcf99bccc7ed94f3db000";

    //   beforeEach(
    //     async () =>
    //     await contract.storeValidatedCondition( chainId, conditionHash, signature)      
    //   );

    //   it ("can not retrieve the unstored condition", async () => {
    //     const [chainId, timeStamp, creator]  = await contract.getValidatedCondition(conditionHash);
    //     expect(chainId).equal(0);
    //     expect(timeStamp).equal(0);
    //     expect(creator).equal("0x0000000000000000000000000000000000000000");
    //   });

    // });


    // context("when valid signature doesn't match the hash", async () => {
    //   const chainId = 1;
    //   const conditionHash = "0x0aeaaf72a19e6bdbb7534082576e4cd768b073934326638b64faf8289113e177";
    //   const signature = "0x8621ac27fd1386c0f09b70b8359e605f5e33f6d68126adc9dd123cd94c512db234925de5d0cd6f3ab06542477a187fec14e02168788f55c9d5298e0ed290099f1b";

    //   beforeEach(
    //     async () =>
    //     await contract.storeValidatedCondition( chainId, conditionHash, signature)      
    //   );

    //   it ("can not retrieve the unstored condition", async () => {
    //     const [chainId, timeStamp, creator]  = await contract.getValidatedCondition(conditionHash);
    //     expect(chainId).equal(0);
    //     expect(timeStamp).equal(0);
    //     expect(creator).equal("0x0000000000000000000000000000000000000000");
    //   });
    // });


    context("valid signature / valid hash", async () => {
      const chainId = 1;
      const conditionHash = "0xac668ab1e4a9c3a9a09ef337698c8c4aeabdbe24333509ea94ca13d920e61db1";
      const signature = "0x8621ac27fd1386c0f09b70b8359e605f5e33f6d68126adc9dd123cd94c512db234925de5d0cd6f3ab06542477a187fec14e02168788f55c9d5298e0ed290099f1b";

      beforeEach(
        async () =>
        await contract.storeValidatedCondition( chainId, conditionHash, signature)      
      );

      it ("condition is valid and stored.", async () => {
        const [chainId, timeStamp, creator]  = await contract.getValidatedCondition(conditionHash);
        expect(chainId).equal(1);
        console.log(timeStamp);
        console.log(creator);
      });
    });




  });

  // describe retrieving a validation
  describe("retrieve a validation", async () => {   
    context("when the hash isn't found ", async () => {
      it ("returns 0 values", async () => {
        const [chainId, timeStamp, creator]  = await contract.getValidatedCondition("0x0aeaaf72a19e6bdbb7534082576e4cd768b073934326638b64faf8289113e1cc");
        expect(chainId).equal(0);
        expect(timeStamp).equal(0);
        expect(creator).equal("0x0000000000000000000000000000000000000000");
      });
    });
    
  });

//  8621ac27fd1386c0f09b70b8359e605f5e33f6d68126adc9dd123cd94c512db2

    // it ("failes to store a validation with a bad signture", async () => {
    //    const chainId = 1;          // uint256 chainId,
    //     let conditionHash = 0x1234;          // bytes32 conditionHash,``
    //     let signature = 0x5678;         // bytes memory signature

    //     // beforeEach(async () => ([creator, tester, ...signers] = signers));

    //         await contract.storeValidatedCondition( chainId, conditionHash, signature)
    //         .then(() => {
    //           expect(true).to.equal(false);
    //         }, (error) => {
    //           expect(error.message).to.equal("invalid signature");
    //         } );


    //   })
    // })
      
})

require("@nomiclabs/hardhat-waffle");
require('hardhat-ethernal'); // required for ethernal - removing this will only break deploy scripts that are linked to ethernal .
// Commenting out lines in these deploy scripts doesn't break the deploy, only the synchronization with Ethernal - ie, safe to do.
// Tests & regular deploys continue to work normally.
// Ethernal is a web based block explorer that syncs from any EVM chain - easy way to "view" hardhat data, and execute contracts!
// https://www.tryethernal.com

require("@nomiclabs/hardhat-etherscan");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const HARMONY_PRIVATE_KEY = "4cda7fa976be61950cb47a082eb3d479ccdf8fe5315480ddd5953c41e86f8cf4";  // test account
const CELO_TEST_PRIVATE_KEY = "";
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.7",
    settings: {
      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
      optimizer: {
        enabled: false,
        runs: 200,
      },
    },
  },
  networks: {
    celo: {
      url: "https://forno.celo.org",
    },
    alfajores: {
     url: "https://alfajores-forno.celo-testnet.org",
    //  accounts: {
    //    mnemonic: process.env.MNEMONIC,
    //    path: "m/44'/52752'/0'/0"
    //  },
      accounts: [`0x${CELO_TEST_PRIVATE_KEY}`],
     chainId: 44787
   },

    harmony_testnet: {
      url: `https://api.s0.b.hmny.io`,
      accounts: [`0x${HARMONY_PRIVATE_KEY}`]
    },
    harmony: {
      url: `https://api.harmony.one`,
      accounts: [`0x${HARMONY_PRIVATE_KEY}`]
    },
    hardhat_sim: {
      url: `http://127.0.0.1:8545`,
      gasPrice: 8000000000, // default is 'auto' which breaks chains without the london hardfork    
     },
    
  },
  etherscan: {
    apiKey: {
      celo: process.env.LIT_CELOSCAN_API_KEY,
    },
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
    ],
  },
};

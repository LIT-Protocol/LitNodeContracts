require("@nomiclabs/hardhat-waffle");
require('hardhat-ethernal'); // required for ethernal - removing this will only break deploy scripts that are linked to ethernal .  
  // Commenting out lines in these deploy scripts doesn't break the deploy, only the synchronization with Ethernal - ie, safe to do. 
  // Tests & regular deploys continue to work normally.
  // Ethernal is a web based block explorer that syncs from any EVM chain - easy way to "view" hardhat data, and execute contracts!
  // https://www.tryethernal.com


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

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.4",
};


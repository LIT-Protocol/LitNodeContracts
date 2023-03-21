require("@nomiclabs/hardhat-waffle");
// require('hardhat-ethernal'); // required for ethernal - removing this will only break deploy scripts that are linked to ethernal .
// Commenting out lines in these deploy scripts doesn't break the deploy, only the synchronization with Ethernal - ie, safe to do.
// Tests & regular deploys continue to work normally.
// Ethernal is a web based block explorer that syncs from any EVM chain - easy way to "view" hardhat data, and execute contracts!
// https://www.tryethernal.com

require("@nomiclabs/hardhat-etherscan");

require("@tenderly/hardhat-tenderly");

require("hardhat-gas-reporter");

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

function envVarOrDefault(envVar, defaultValue) {
    if (process.env[envVar] == undefined) {
        return defaultValue;
    }
    return process.env[envVar];
}

// NOTE, below we use the privkey key 0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166
// as a default.  it is empty.  DO NOT SEND MONEY TO IT.  it's public.

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        version: "0.8.17",
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
            accounts: [
                envVarOrDefault(
                    "LIT_CELO_DEPLOYER_PRIVATE_KEY",
                    "0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166"
                ),
            ],
        },
        mumbai: {
            url: "https://polygon-mumbai.g.alchemy.com/v2/onvoLvV97DDoLkAmdi0Cj7sxvfglKqDh",
            accounts: [
                envVarOrDefault(
                    "LIT_MUMBAI_DEPLOYER_PRIVATE_KEY",
                    "0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166"
                ),
            ],
        },
        alfajores: {
            url: "https://alfajores-forno.celo-testnet.org",
            accounts: [
                envVarOrDefault(
                    "LIT_ALFAJORES_DEPLOYER_PRIVATE_KEY",
                    "0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166"
                ),
            ],
        },
        polygon: {
            url: "https://polygon-rpc.com",
            accounts: [
                envVarOrDefault(
                    "LIT_POLYGON_DEPLOYER_PRIVATE_KEY",
                    "0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166"
                ),
            ],
        },
        litTestnet: {
            url: "https://lit-test.calderachain.xyz/http",
            accounts: [
                envVarOrDefault(
                    "LIT_ROLLUP_TESTNET_DEPLOYER_PRIVATE_KEY",
                    "0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166"
                ),
            ],
            chainId: 987,
        },
        lit: {
            url: "https://lit-protocol.calderachain.xyz/http",
            accounts: [
                envVarOrDefault(
                    "LIT_ROLLUP_MAINNET_DEPLOYER_PRIVATE_KEY",
                    "0x3178746f7ae6a309d14444b4c6c85a96a4be2f53fa8950dea241d232f3e6c166"
                ),
            ],
            chainId: 175177,
            wlitAddress: "0xBB118507E802D17ECDD4343797066dDc13Cde7C6",
        },
    },
    etherscan: {
        apiKey: {
            celo: process.env.LIT_CELOSCAN_API_KEY,
            mumbai: process.env.LIT_POLYGONSCAN_API_KEY,
            polygon: process.env.LIT_POLYGONSCAN_API_KEY,
            litTestnet: "meow",
            lit: "woof",
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
            {
                network: "alfajores",
                chainId: 44787,
                urls: {
                    apiURL: "https://api-alfajores.celoscan.io/api",
                    browserURL: "https://alfajores.celoscan.io/",
                },
            },
            {
                network: "mumbai",
                chainId: 80001,
                urls: {
                    apiURL: "https://api-testnet.polygonscan.com/api",
                    browserURL: "https://mumbai.polygonscan.com",
                },
            },
            {
                network: "polygon",
                chainId: 137,
                urls: {
                    apiURL: "https://api.polygonscan.com/api",
                    browserURL: "https://polygonscan.com",
                },
            },
            {
                network: "litTestnet",
                chainId: 987,
                urls: {
                    apiURL: "https://lit-test.calderaexplorer.xyz/api",
                    browserURL: "https://lit-test.calderaexplorer.xyz",
                },
            },
            {
                network: "lit",
                chainId: 175177,
                urls: {
                    apiURL: "https://lit-protocol.calderaexplorer.xyz/api",
                    browserURL: "https://lit-protocol.calderaexplorer.xyz",
                },
            },
        ],
    },
    tenderly: {
        project: "litnodecontracts",
        username: "rwiggum",
        // forkNetwork: "",
        privateVerification: false,
        // deploymentsDir: "deployments"
    },
};

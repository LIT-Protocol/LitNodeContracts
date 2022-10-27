These contracts govern the Lit Nodes and various PKP things. Currently in testnet only.

Learn more here: https://developer.litprotocol.com/docs/litactionsandpkps/whatarelitactionsandpkps/

# TODO

- Tests for the token reward in the staking contracts (Staking.sol and Staking.js)
- Make it so that the nodes can't accidently kick eachother to below the threshold. Limit the number of nodes that can be kicked per epoch? Have the ability to rejoin if kicked and recovered?

# How to verify contracts

`npx hardhat verify --network celo 0x5Ef8A5e3b74DE013d608740F934c14109ae12a81 "0x0008a7B1Ce657E78b4eDC6FC40078ce8bf08329A"`

The second param is any constructor params.

# Deploying

Use the `deployEverythingToMumbai.sh` script to deploy all the contracts and create config files for the nodes. You should set the ENV var LIT_MUMBAI_DEPLOYER_PRIVATE_KEY to the private key of the account you want to deploy from. It should have Polygon Mumbai testnet tokens in it for gas. You can get them from the [Polygon Mumbai faucet](https://faucet.matic.network/) or from the [Alchemy mumbai faucet](https://mumbaifaucet.com/) or if you need even more ask Chris on slack.

Note: The deploy script will set the ownership of each contract to the `newOwner` address defined in scripts/deploy_everything.js. If you need to call owner / admin functions on the contracts after they're deployed, you can set that `newOwner` address to something you control. If you're just using the contracts with the nodes you probably don't need to do this.

Once this script is done running, there will be config files for you generated in /node_configs of this repo. You can copy these to the /config folder of the lit_node_rust repo.

These contracts govern the Lit Nodes and various PKP things. Currently in testnet only.

Learn more here: https://developer.litprotocol.com/docs/litactionsandpkps/whatarelitactionsandpkps/

# TODO

- Tests for the token reward in the staking contracts (Staking.sol and Staking.js)
- Make it so that the nodes can't accidently kick eachother to below the threshold. Limit the number of nodes that can be kicked per epoch? Have the ability to rejoin if kicked and recovered?

# How to verify contracts

`npx hardhat verify --network celo 0x5Ef8A5e3b74DE013d608740F934c14109ae12a81 "0x0008a7B1Ce657E78b4eDC6FC40078ce8bf08329A"`

The second param is any constructor params.

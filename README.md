These contracts govern the Lit Nodes and various PKP things. Currently in testnet only.

Learn more here: https://developer.litprotocol.com/docs/litactionsandpkps/whatarelitactionsandpkps/

# TODO

- Tests for the token reward in the staking contracts (Staking.sol and Staking.js)
- Make it so that the nodes can't accidently kick eachother to below the threshold. Limit the number of nodes that can be kicked per epoch? Have the ability to rejoin if kicked and recovered?

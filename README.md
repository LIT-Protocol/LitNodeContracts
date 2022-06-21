# TODO

- Tests for the token reward in the staking contracts (Staking.sol and Staking.js)
- Make signalReadyForNextEpoch use the union of the current epoch nodes and the next epoch nodes
- Make it so that the nodes can't accidently kick eachother to below the threshold. Limit the number of nodes that can be kicked per epoch? Have the ability to rejoin if kicked and recovered?

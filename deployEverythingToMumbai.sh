#!/bin/bash

npx hardhat run --network mumbai scripts/deploy_everything.js

npx hardhat run --network mumbai scripts/fund_and_stake_nodes.js

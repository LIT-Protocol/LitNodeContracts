#!/bin/bash

set -e
. "./deployInit.sh"

npx hardhat run --network celo scripts/deploy_everything.js

npx hardhat run --network mumbai scripts/fund_and_stake_nodes.js
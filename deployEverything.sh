#!/bin/bash

set -e
. "./deployInit.sh"

echo "Deploy init completed"

npx hardhat run --network "${NETWORK}" scripts/deploy_everything.js && npx hardhat run --network "${NETWORK}" scripts/fund_and_stake_nodes.js



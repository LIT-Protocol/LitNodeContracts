#!/bin/bash

set -e
. "./deployInit.sh"



npx hardhat run --network "${NETWORK}" scripts/deploy_everything_for_solonet.js && npx hardhat run --network "${NETWORK}" scripts/fund_and_stake_nodes.js



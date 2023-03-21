#!/bin/bash

set -e

export ENV="$1"
export RESOLVER_CONTRACT_ADDRESS="$2"
export NETWORK="$3"

export SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
export LIT_OS_DIR="${SCRIPT_DIR}/../lit-os"

setup_project() {
  if [ ! -e "${LIT_OS_DIR}" ]; then
    # checkout the lit-os repo
    cd "${SCRIPT_DIR}/.."
    git clone git@github.com:LIT-Protocol/lit-os.git
  fi

  # Link the ContractResolver so we can call it.
  if [ ! -e "${SCRIPT_DIR}/contracts/ContractResolver.sol" ]; then
    ln -s "${LIT_OS_DIR}/blockchain/contracts/ContractResolver.sol" contracts/
  fi
}

if [ -z "${ENV}" ]; then
  echo "Usage: $0 <dev|staging|prod>"
  exit 2
fi
if [ "${ENV}" = "_SETUP_" ]; then
  setup_project
  exit 0
fi
if [ "${ENV}" != "dev" ] && [ "${ENV}" != "staging" ] && [ "${ENV}" != "prod" ]; then
  echo "Invalid environment (valid: dev, staging, prod)"
  exit 2
fi

if [ -z "${NETWORK}" ]; then
  NETWORK="mumbai"
fi
if [ -z "${RESOLVER_CONTRACT_ADDRESS}" ]; then
  if [ -z "${LIT_RESOLVER_CONTRACT_ADDRESS}" ]; then
    # deploy the resolver etc.
    cd ..
    cd lit-os/blockchain
    ./scripts/deploy.sh "${ENV}"

    export RESOLVER_CONTRACT_ADDRESS=$(cat deployed-contracts-$ENV.json | jq -r ".contractResolver")
    cd ../..
    cd LitNodeContracts

  else
    # Default from LIT_RESOLVER_CONTRACT_ADDRESS
    export RESOLVER_CONTRACT_ADDRESS="${LIT_RESOLVER_CONTRACT_ADDRESS}"
  fi
fi

if [ -n "${RESOLVER_CONTRACT_ADDRESS}" ]; then
  setup_project
fi

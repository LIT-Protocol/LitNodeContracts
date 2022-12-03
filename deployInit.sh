#!/bin/bash

set -e

export ENV="$1"
export RESOLVER_CONTRACT_ADDRESS="$2"
export NETWORK="$3"

export SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
export LIT_OS_DIR="${SCRIPT_DIR}/../lit-os"

if [ -z "${ENV}" ]; then
  echo "Usage: $0 <dev|test|prod>"
  exit 2
fi
if [ "${ENV}" != "dev" ] && [ "${ENV}" != "test" ] && [ "${ENV}" != "prod" ]; then
  echo "Invalid environment (valid: dev, test, prod)"
  exit 2
fi

if [ -z "${NETWORK}" ]; then
  NETWORK="mumbai"
fi
if [ -z "${RESOLVER_CONTRACT_ADDRESS}" ]; then
  # Default from LIT_RESOLVER_CONTRACT_ADDRESS
  export RESOLVER_CONTRACT_ADDRESS="${LIT_RESOLVER_CONTRACT_ADDRESS}"
fi

if [ -n "${RESOLVER_CONTRACT_ADDRESS}" ]; then
  if [ ! -e "${LIT_OS_DIR}" ]; then
    echo "Error: lit-os checkout is required when providing resolver contract "
    echo "       address (checkout dir: $(readlink -f $LIT_OS_DIR)"
    exit 2
  fi

  # Link the ContractResolver so we can call it.
  if [ ! -e "${SCRIPT_DIR}/contracts/ContractResolver.sol" ]; then
    ln -s "${LIT_OS_DIR}/blockchain/contracts/ContractResolver.sol" contracts/
  fi
fi
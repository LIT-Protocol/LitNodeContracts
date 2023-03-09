require('@chugsplash/core')
const { utils } = require('ethers')

const deployer = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const ADMIN_ROLE = utils.keccak256(utils.toUtf8Bytes("ADMIN"))
const MINTER_ROLE = utils.keccak256(utils.toUtf8Bytes("MINTER"))

module.exports = {
  options: {
    projectName: 'Hello ChugSplash',
  },
  contracts: {
    LITToken: {
      contract: 'LITToken',
      variables: {
        _balances: {
          [deployer]: utils.parseUnits("1000000000", 18)
        },
        _allowances: {},
        _totalSupply: utils.parseUnits("100000000000", 18),
        _name: "Lit Protocol",
        _symbol: "LIT",
        _roles: {
          [MINTER_ROLE]: {
            members: {
              [deployer]: true,
            },
            adminRole: ADMIN_ROLE
          },
          [ADMIN_ROLE]: {
            members: {
              [deployer]: true,
            },
            adminRole: ADMIN_ROLE
          }
        },
        _initialized: 255,
        _initializing: false,
        __gap: []
      },
    },
  },
}

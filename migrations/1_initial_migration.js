const LITToken = artifacts.require("LITToken");

module.exports = function (deployer) {
  deployer.deploy(LITToken);
};

const { expect } = require("chai");
// const hre = require("hardhat");
// const { ethers } = hre;
// const chainName = hre.network.name;

// console.log("chainName", chainName);

describe("Allowlist", function () {
    let signers;
    let contract;

    let ContractFactory;

    before(async () => {
        ContractFactory = await ethers.getContractFactory("Allowlist");
    });

    beforeEach(async () => {
        signers = await ethers.getSigners();
    });

    beforeEach(async () => {
        contract = await ContractFactory.deploy();
    });

    describe("Test the Allowlist", async () => {
        context("unallowed by default", async () => {
            let deployer;
            let tester;

            beforeEach(async () => ([deployer, tester, ...signers] = signers));

            beforeEach(async () => (contract = contract.connect(tester)));

            it("is unallowed", async () => {
                const allowed = await contract.isAllowed(
                    ethers.utils.keccak256("0x123456")
                );
                expect(allowed).equal(false);
            });
        });

        context("when the owner sets things", async () => {
            let deployer;
            let tester;

            const key = "0x123456789f";

            beforeEach(async () => {
                [deployer, tester, ...signers] = signers;
            });

            beforeEach(async () => (contract = contract.connect(tester)));

            it("can allow and unallow things", async () => {
                // unallowed by default
                let allowed = await contract.isAllowed(
                    ethers.utils.keccak256(key)
                );
                expect(allowed).equal(false);

                // attempt to allow it with the wrong address.  it should revert.
                expect(
                    contract.setAllowed(ethers.utils.keccak256(key))
                ).revertedWith("Ownable: caller is not the owner");

                // connect the owner and try allowing
                contract = contract.connect(deployer);
                await contract.setAllowed(ethers.utils.keccak256(key));

                allowed = await contract.isAllowed(ethers.utils.keccak256(key));
                expect(allowed).equal(true);

                contract = contract.connect(tester);
                // attempt to unallow it with the wrong address.  it should revert.
                expect(
                    contract.setNotAllowed(ethers.utils.keccak256(key))
                ).revertedWith("Ownable: caller is not the owner");

                // connect the owner and try unallowing
                contract = contract.connect(deployer);
                await contract.setNotAllowed(ethers.utils.keccak256(key));

                allowed = await contract.isAllowed(ethers.utils.keccak256(key));
                expect(allowed).equal(false);
            });
        });
    });
});

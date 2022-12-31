const {expect} = require("chai");

describe("LITToken", function () {
    let deployer;
    let signers;
    let token;

    let TokenFactory;

    before(async () => {
        TokenFactory = await ethers.getContractFactory("LITToken");
    });

    beforeEach(async () => {
        [deployer, ...signers] = await ethers.getSigners();
    });

    beforeEach(async () => {
        token = await TokenFactory.deploy();
    });

    it("grants the admin role to the deployer", async () => {
        expect(
            await token.hasRole(
                await token.ADMIN_ROLE(),
                await deployer.getAddress()
            )
        ).is.true;
    });

    it("grants the minter role to the deployer", async () => {
        expect(
            await token.hasRole(
                await token.MINTER_ROLE(),
                await deployer.getAddress()
            )
        ).is.true;
    });

    describe("mint", async () => {
        context("when unauthorized", async () => {
            let unauthorizedMinter;
            let recipient;

            beforeEach(
                async () =>
                    ([unauthorizedMinter, recipient, ...signers] = signers)
            );

            beforeEach(async () => (token = token.connect(unauthorizedMinter)));

            it("reverts", async () => {
                expect(
                    token.mint(await recipient.getAddress(), 1)
                ).revertedWith("LITToken: only minter");
            });
        });

        context("when authorized", async () => {
            let minter;
            let recipient;
            const amount = 1000;

            beforeEach(async () => ([minter, recipient, ...signers] = signers));

            beforeEach(
                async () =>
                    await token.grantRole(
                        await token.MINTER_ROLE(),
                        await minter.getAddress()
                    )
            );

            beforeEach(async () => (token = token.connect(minter)));

            it("mints tokens", async () => {
                await token.mint(await recipient.getAddress(), amount);
                expect(
                    await token.balanceOf(await recipient.getAddress())
                ).equal(amount);
            });
        });
    });
});

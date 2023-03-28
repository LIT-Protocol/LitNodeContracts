const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");
const {
    ipfsIdToIpfsIdHash,
    getBytes32FromMultihash,
    getBytesFromMultihash,
} = require("../utils.js");

describe("PKPHelper", function () {
    let deployer;
    let signers;
    let pkpContract;
    let router;
    let pkpHelper;
    let pkpPermissions;

    let PkpFactory;
    let RouterFactory;
    let PkpHelperFactory;

    before(async () => {
        PkpFactory = await ethers.getContractFactory("PKPNFT");
        RouterFactory = await smock.mock("PubkeyRouter");
        PkpHelperFactory = await ethers.getContractFactory("PKPHelper");
        PkpPermissionsFactory = await ethers.getContractFactory(
            "PKPPermissions"
        );
    });

    beforeEach(async () => {
        [deployer, ...signers] = await ethers.getSigners();
    });

    beforeEach(async () => {
        pkpContract = await PkpFactory.deploy();
        router = await RouterFactory.deploy(pkpContract.address);
        await pkpContract.setRouterAddress(router.address);
        pkpPermissions = await PkpPermissionsFactory.deploy(
            pkpContract.address
        );
        pkpHelper = await PkpHelperFactory.deploy(
            pkpContract.address,
            pkpPermissions.address
        );
    });

    describe("Attempt to Mint PKP NFT via PKPHelper", async () => {
        let minter;

        beforeEach(async () => ([minter, recipient, ...signers] = signers));
        beforeEach(async () => {
            pkpContract = pkpContract.connect(minter);
            pkpHelper = pkpHelper.connect(minter);
        });

        it("mints successfully with permitted auth methods", async () => {
            let pubkey =
                "0x0478a6d8579e7b595d2c4c04b8d822f2a0fd8801ab352443db93da793383766e0bee476b8a8ab2f72754237b3e31d6ee0e000646642c7b50757f8645f26d802336";
            const pubkeyHash = ethers.utils.keccak256(pubkey);
            const tokenId = ethers.BigNumber.from(pubkeyHash);
            //console.log("PubkeyHash: " , pubkeyHash);
            // route it
            await router.setRoutingData(
                tokenId,
                pubkey,
                "0x0000000000000000000000000000000000000003",
                2
            );

            const addressesToPermit = [
                "0x75EdCdfb5A678290A8654979703bdb75C683B3dD",
                "0xeb250b8DA8021fE09Ea2D0121e20eDa65D523aA6",
            ];
            const ipfsIdsToPermit = [
                "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z",
                "QmSX1eaPhZjxb8rJtejunop8Sq41FMSUVv9HfqtPNtVi7j",
            ];
            const ipfsIdsBytes = ipfsIdsToPermit.map((f) =>
                getBytesFromMultihash(f)
            );
            // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
            // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
            const authMethodTypes = [4, 5];
            const authMethodUserIds = [
                "0xdeadbeef",
                "0x7ce7b7b6766949f0bf8552a0db7117de4e5628321ae8c589e67e5839ee3c1912402dfd0ed9be127812d0d2c16df2ac2c319ebed0927b0de98a3b946767577ad7",
            ];
            const authMethodPubkeys = [
                "0xacbe9af83570da302d072984c4938bd7d9dd86186ebedf53d693171d48dbf5e60e2ae9dc9f72ee9592b054ec0a9de5d3bac6a35b9f658b5183c40990e588ffea",
                "0x00",
            ];
            const authMethodIdHashes = authMethodUserIds.map((f, idx) =>
                ethers.utils.keccak256(
                    ethers.utils.defaultAbiCoder.encode(
                        ["uint256", "bytes"],
                        [authMethodTypes[idx], f]
                    )
                )
            );

            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            await pkpHelper.mintNextAndAddAuthMethodsWithTypes(
                2,
                ipfsIdsBytes,
                [[], []],
                addressesToPermit,
                [[], []],
                authMethodTypes,
                authMethodUserIds,
                authMethodPubkeys,
                [[], []],
                true, //addPkpEthAddressAsPermittedAddress,
                false, // sendPkpToItself
                transaction
            );

            // check the token was minted
            const owner = await pkpContract.ownerOf(tokenId);
            expect(owner).to.equal(minter.address);

            const pkpEthAddress = await pkpPermissions.getEthAddress(tokenId);

            // check the auth methods
            for (let i = 0; i < addressesToPermit.length; i++) {
                const actionIsPermitted =
                    await pkpPermissions.isPermittedAction(
                        tokenId,
                        ipfsIdsBytes[i]
                    );
                expect(actionIsPermitted).to.equal(true);
            }

            for (let i = 0; i < addressesToPermit.length; i++) {
                const addressIsPermitted =
                    await pkpPermissions.isPermittedAddress(
                        tokenId,
                        addressesToPermit[i]
                    );
                expect(addressIsPermitted).to.equal(true);
            }

            // confirm that the owner is also permitted
            const ownerIsPermitted = await pkpPermissions.isPermittedAddress(
                tokenId,
                minter.address
            );
            expect(ownerIsPermitted).to.equal(true);

            // confirm that the pkp eth address is permitted
            const pkpEthAddressIsPermitted =
                await pkpPermissions.isPermittedAddress(tokenId, pkpEthAddress);
            expect(pkpEthAddressIsPermitted).to.equal(true);

            for (let i = 0; i < authMethodTypes.length; i++) {
                const authMethodIsPermitted =
                    await pkpPermissions.isPermittedAuthMethod(
                        tokenId,
                        authMethodTypes[i],
                        authMethodUserIds[i]
                    );
                expect(authMethodIsPermitted).to.equal(true);
            }

            // check the reverse mapping of the auth method
            for (let i = 0; i < authMethodTypes.length; i++) {
                const authedTokenIds =
                    await pkpPermissions.getTokenIdsForAuthMethod(
                        authMethodTypes[i],
                        authMethodUserIds[i]
                    );
                expect(authedTokenIds).to.deep.equal([tokenId]);
            }

            // check all the getters
            const permittedActions = await pkpPermissions.getPermittedActions(
                tokenId
            );
            // console.log("permittedActions: ", permittedActions);
            expect(permittedActions).to.deep.equal(ipfsIdsBytes);

            const permittedAddresses =
                await pkpPermissions.getPermittedAddresses(tokenId);
            expect(permittedAddresses).to.deep.equal([
                minter.address,
                ...addressesToPermit,
                pkpEthAddress,
            ]);

            const permittedAuthMethods =
                await pkpPermissions.getPermittedAuthMethods(tokenId);
            expect(permittedAuthMethods.length).to.equal(7);
            // console.log("permittedAuthMethods: ", permittedAuthMethods);
            let authMethodIndex = 0;
            for (let i = 0; i < permittedAuthMethods.length; i++) {
                if (
                    permittedAuthMethods[i][0].toNumber() !== 1 &&
                    permittedAuthMethods[i][0].toNumber() !== 2
                ) {
                    expect([
                        permittedAuthMethods[i][0].toNumber(),
                        permittedAuthMethods[i][1],
                        permittedAuthMethods[i][2],
                    ]).to.deep.equal([
                        authMethodTypes[authMethodIndex],
                        authMethodUserIds[authMethodIndex],
                        authMethodPubkeys[authMethodIndex],
                    ]);
                    authMethodIndex++;
                }
            }
        });

        it("mints successfully with permitted auth methods using the simple non-typed function", async () => {
            let pubkey =
                "0x04359eeca3b8852d0c54ccc190ae8f0a4f0f27d11cb72ecc2cc11aab6fff1f08610090301a6ab7f8afbbcd167bc2406e366ee7bc49373c20f95fabd5165454f934";
            const pubkeyHash = ethers.utils.keccak256(pubkey);
            const tokenId = ethers.BigNumber.from(pubkeyHash);
            //console.log("PubkeyHash: " , pubkeyHash);
            // route it
            await router.setRoutingData(
                tokenId,
                pubkey,
                "0x0000000000000000000000000000000000000003",
                2
            );

            const addressesToPermit = [
                "0x75EdCdfb5A678290A8654979703bdb75C683B3dD",
                "0xeb250b8DA8021fE09Ea2D0121e20eDa65D523aA6",
            ];
            const ipfsIdsToPermit = [
                "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z",
                "QmSX1eaPhZjxb8rJtejunop8Sq41FMSUVv9HfqtPNtVi7j",
            ];
            const ipfsIdsBytes = ipfsIdsToPermit.map((f) =>
                getBytesFromMultihash(f)
            );
            // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
            // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
            const authMethodTypes = [4, 5, 2, 2, 1, 1];
            const authMethodUserIds = [
                "0xdeadbeef",
                "0x7ce7b7b6766949f0bf8552a0db7117de4e5628321ae8c589e67e5839ee3c1912402dfd0ed9be127812d0d2c16df2ac2c319ebed0927b0de98a3b946767577ad7",
                ...ipfsIdsBytes,
                ...addressesToPermit,
            ];
            const authMethodPubkeys = [
                "0xacbe9af83570da302d072984c4938bd7d9dd86186ebedf53d693171d48dbf5e60e2ae9dc9f72ee9592b054ec0a9de5d3bac6a35b9f658b5183c40990e588ffea",
                "0x00",
                ...ipfsIdsBytes.map((r) => "0x00"),
                ...addressesToPermit.map((r) => "0x00"),
            ];

            const authMethodScopes = authMethodUserIds.map((r) => []);

            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            await pkpHelper.mintNextAndAddAuthMethods(
                2,
                authMethodTypes,
                authMethodUserIds,
                authMethodPubkeys,
                authMethodScopes,
                true, //addPkpEthAddressAsPermittedAddress,
                false, // sendPkpToItself
                transaction
            );

            // check the token was minted
            const owner = await pkpContract.ownerOf(tokenId);
            expect(owner).to.equal(minter.address);

            const pkpEthAddress = await pkpPermissions.getEthAddress(tokenId);

            // check the auth methods
            for (let i = 0; i < addressesToPermit.length; i++) {
                const actionIsPermitted =
                    await pkpPermissions.isPermittedAction(
                        tokenId,
                        ipfsIdsBytes[i]
                    );
                expect(actionIsPermitted).to.equal(true);
            }

            for (let i = 0; i < addressesToPermit.length; i++) {
                const addressIsPermitted =
                    await pkpPermissions.isPermittedAddress(
                        tokenId,
                        addressesToPermit[i]
                    );
                expect(addressIsPermitted).to.equal(true);
            }

            // confirm that the owner is also permitted
            const ownerIsPermitted = await pkpPermissions.isPermittedAddress(
                tokenId,
                minter.address
            );
            expect(ownerIsPermitted).to.equal(true);

            // confirm that the pkp eth address is permitted
            const pkpEthAddressIsPermitted =
                await pkpPermissions.isPermittedAddress(tokenId, pkpEthAddress);
            expect(pkpEthAddressIsPermitted).to.equal(true);

            for (let i = 0; i < authMethodTypes.length; i++) {
                const authMethodIsPermitted =
                    await pkpPermissions.isPermittedAuthMethod(
                        tokenId,
                        authMethodTypes[i],
                        authMethodUserIds[i]
                    );
                expect(authMethodIsPermitted).to.equal(true);
            }

            // check the reverse mapping of the auth method
            for (let i = 0; i < authMethodTypes.length; i++) {
                const authedTokenIds =
                    await pkpPermissions.getTokenIdsForAuthMethod(
                        authMethodTypes[i],
                        authMethodUserIds[i]
                    );
                expect(authedTokenIds).to.deep.equal([tokenId]);
            }

            // check all the getters
            const permittedActions = await pkpPermissions.getPermittedActions(
                tokenId
            );
            // console.log("permittedActions: ", permittedActions);
            expect(permittedActions).to.deep.equal(ipfsIdsBytes);

            const permittedAddresses =
                await pkpPermissions.getPermittedAddresses(tokenId);
            expect(permittedAddresses).to.deep.equal([
                minter.address,
                ...addressesToPermit,
                pkpEthAddress,
            ]);

            const permittedAuthMethods =
                await pkpPermissions.getPermittedAuthMethods(tokenId);
            expect(permittedAuthMethods.length).to.equal(7);
            // console.log("permittedAuthMethods: ", permittedAuthMethods);
            let authMethodIndex = 0;
            for (let i = 0; i < permittedAuthMethods.length; i++) {
                if (
                    permittedAuthMethods[i][0].toNumber() !== 1 &&
                    permittedAuthMethods[i][0].toNumber() !== 2
                ) {
                    expect([
                        permittedAuthMethods[i][0].toNumber(),
                        permittedAuthMethods[i][1],
                        permittedAuthMethods[i][2],
                    ]).to.deep.equal([
                        authMethodTypes[authMethodIndex],
                        authMethodUserIds[authMethodIndex],
                        authMethodPubkeys[authMethodIndex],
                    ]);
                    authMethodIndex++;
                }
            }
        });

        it("mints successfully with permitted auth methods and sends the PKP to itself", async () => {
            let pubkey =
                "0x044e4b7f7fd685aec490a7eefce29ed41e6c4855f162c36c8e859536715704b4d8a5ba52be46836e3e8cd15ee7e89c8b89db288af84b3d1dc0707dea62e1babf17";
            const pubkeyHash = ethers.utils.keccak256(pubkey);
            const tokenId = ethers.BigNumber.from(pubkeyHash);
            //console.log("PubkeyHash: " , pubkeyHash);
            // route it
            await router.setRoutingData(
                tokenId,
                pubkey,
                "0x0000000000000000000000000000000000000003",
                2
            );

            const addressesToPermit = [
                "0x75EdCdfb5A678290A8654979703bdb75C683B3dD",
                "0xeb250b8DA8021fE09Ea2D0121e20eDa65D523aA6",
            ];
            const ipfsIdsToPermit = [
                "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z",
                "QmSX1eaPhZjxb8rJtejunop8Sq41FMSUVv9HfqtPNtVi7j",
            ];
            const ipfsIdsBytes = ipfsIdsToPermit.map((f) =>
                getBytesFromMultihash(f)
            );
            // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
            // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
            const authMethodTypes = [4, 5];
            const authMethodUserIds = [
                "0xdeadbeef",
                "0x7ce7b7b6766949f0bf8552a0db7117de4e5628321ae8c589e67e5839ee3c1912402dfd0ed9be127812d0d2c16df2ac2c319ebed0927b0de98a3b946767577ad7",
            ];
            const authMethodPubkeys = [
                "0xacbe9af83570da302d072984c4938bd7d9dd86186ebedf53d693171d48dbf5e60e2ae9dc9f72ee9592b054ec0a9de5d3bac6a35b9f658b5183c40990e588ffea",
                "0x00",
            ];
            const authMethodIdHashes = authMethodUserIds.map((f, idx) =>
                ethers.utils.keccak256(
                    ethers.utils.defaultAbiCoder.encode(
                        ["uint256", "bytes"],
                        [authMethodTypes[idx], f]
                    )
                )
            );

            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            await pkpHelper.mintNextAndAddAuthMethodsWithTypes(
                2,
                ipfsIdsBytes,
                [[], []],
                addressesToPermit,
                [[], []],
                authMethodTypes,
                authMethodUserIds,
                authMethodPubkeys,
                [[], []],
                true, //addPkpEthAddressAsPermittedAddress,
                true, // sendPkpToItself
                transaction
            );

            const pkpEthAddress = await pkpPermissions.getEthAddress(tokenId);

            // check the token was minted and is owned by the PKP itself
            const owner = await pkpContract.ownerOf(tokenId);
            expect(owner).to.equal(pkpEthAddress);

            // check the auth methods
            for (let i = 0; i < addressesToPermit.length; i++) {
                const actionIsPermitted =
                    await pkpPermissions.isPermittedAction(
                        tokenId,
                        ipfsIdsBytes[i]
                    );
                expect(actionIsPermitted).to.equal(true);
            }

            for (let i = 0; i < addressesToPermit.length; i++) {
                const addressIsPermitted =
                    await pkpPermissions.isPermittedAddress(
                        tokenId,
                        addressesToPermit[i]
                    );
                expect(addressIsPermitted).to.equal(true);
            }

            // confirm that the owner is also permitted
            const ownerIsPermitted = await pkpPermissions.isPermittedAddress(
                tokenId,
                pkpEthAddress
            );
            expect(ownerIsPermitted).to.equal(true);

            // confirm that the pkp eth address is permitted
            const pkpEthAddressIsPermitted =
                await pkpPermissions.isPermittedAddress(tokenId, pkpEthAddress);
            expect(pkpEthAddressIsPermitted).to.equal(true);

            for (let i = 0; i < authMethodTypes.length; i++) {
                const authMethodIsPermitted =
                    await pkpPermissions.isPermittedAuthMethod(
                        tokenId,
                        authMethodTypes[i],
                        authMethodUserIds[i]
                    );
                expect(authMethodIsPermitted).to.equal(true);
            }

            // check the reverse mapping of the auth method
            for (let i = 0; i < authMethodTypes.length; i++) {
                const authedTokenIds =
                    await pkpPermissions.getTokenIdsForAuthMethod(
                        authMethodTypes[i],
                        authMethodUserIds[i]
                    );
                expect(authedTokenIds).to.deep.equal([tokenId]);
            }

            // check all the getters
            const permittedActions = await pkpPermissions.getPermittedActions(
                tokenId
            );
            // console.log("permittedActions: ", permittedActions);
            expect(permittedActions).to.deep.equal(ipfsIdsBytes);

            const permittedAddresses =
                await pkpPermissions.getPermittedAddresses(tokenId);
            expect(permittedAddresses).to.deep.equal([
                pkpEthAddress,
                ...addressesToPermit,
                pkpEthAddress,
            ]);

            const permittedAuthMethods =
                await pkpPermissions.getPermittedAuthMethods(tokenId);
            expect(permittedAuthMethods.length).to.equal(7);
            // console.log("permittedAuthMethods: ", permittedAuthMethods);
            let authMethodIndex = 0;
            for (let i = 0; i < permittedAuthMethods.length; i++) {
                if (
                    permittedAuthMethods[i][0].toNumber() !== 1 &&
                    permittedAuthMethods[i][0].toNumber() !== 2
                ) {
                    expect([
                        permittedAuthMethods[i][0].toNumber(),
                        permittedAuthMethods[i][1],
                        permittedAuthMethods[i][2],
                    ]).to.deep.equal([
                        authMethodTypes[authMethodIndex],
                        authMethodUserIds[authMethodIndex],
                        authMethodPubkeys[authMethodIndex],
                    ]);
                    authMethodIndex++;
                }
            }
        });

        it("mints without setting the pkp nft address as permitted", async () => {
            let pubkey =
                "0x04aae08ba986cf0c2e41b367e452751c9efb81170adb9c5e5a96cb0359f592c2b6fa5b12c752a501fdaf4701b4b6b2edd3ecb852c8c36b3759e802c45988dad84b";
            const pubkeyHash = ethers.utils.keccak256(pubkey);
            const tokenId = ethers.BigNumber.from(pubkeyHash);
            //console.log("PubkeyHash: " , pubkeyHash);

            // route it
            await router.setRoutingData(
                tokenId,
                pubkey,
                "0x0000000000000000000000000000000000000003",
                2
            );

            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            await pkpHelper.mintNextAndAddAuthMethodsWithTypes(
                2,
                [],
                [],
                [],
                [],
                [],
                [],
                [],
                [],
                false, //addPkpEthAddressAsPermittedAddress,
                false, //sendPkpToItself
                transaction
            );

            // check the token was minted
            const owner = await pkpContract.ownerOf(tokenId);
            expect(owner).to.equal(minter.address);

            // check all the getters
            const permittedActions = await pkpPermissions.getPermittedActions(
                tokenId
            );
            // console.log("permittedActions: ", permittedActions);
            expect(permittedActions).to.deep.equal([]);

            const permittedAddresses =
                await pkpPermissions.getPermittedAddresses(tokenId);
            expect(permittedAddresses).to.deep.equal([minter.address]);

            const permittedAuthMethods =
                await pkpPermissions.getPermittedAuthMethods(tokenId);
            expect(permittedAuthMethods.length).to.equal(0);
        });

        it("mints successfully with empty auth methods", async () => {
            let pubkey =
                "0x044471ff63fee1e95faf335cc55505f4c1edb3435f25daa3bb6aaef7300a562ebf876fe3e088a3d6b32c4c02c9727625d1f530f7171245bcaa4cac7ec99cd5345c";
            const pubkeyHash = ethers.utils.keccak256(pubkey);
            const tokenId = ethers.BigNumber.from(pubkeyHash);
            //console.log("PubkeyHash: " , pubkeyHash);
            // route it
            await router.setRoutingData(
                tokenId,
                pubkey,
                "0x0000000000000000000000000000000000000003",
                2
            );

            const addressesToPermit = [];
            const ipfsIdsToPermit = [];
            const ipfsIdsBytes = ipfsIdsToPermit.map((f) =>
                getBytesFromMultihash(f)
            );
            // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
            // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
            const authMethodTypes = [];
            const authMethodUserIds = [];
            const authMethodPubkeys = [];

            // send eth with the txn
            const mintCost = await pkpContract.mintCost();
            const transaction = {
                value: mintCost,
            };

            await pkpHelper.mintNextAndAddAuthMethodsWithTypes(
                2,
                ipfsIdsBytes,
                [],
                addressesToPermit,
                [],
                authMethodTypes,
                authMethodUserIds,
                authMethodPubkeys,
                [],
                true, //addPkpEthAddressAsPermittedAddress,
                false, // sendPkpToItself
                transaction
            );

            // check the token was minted
            const owner = await pkpContract.ownerOf(tokenId);
            expect(owner).to.equal(minter.address);

            const pkpEthAddress = await pkpPermissions.getEthAddress(tokenId);

            // confirm that the owner is permitted
            const ownerIsPermitted = await pkpPermissions.isPermittedAddress(
                tokenId,
                minter.address
            );
            expect(ownerIsPermitted).to.equal(true);

            // confirm that the pkp eth address is permitted
            const pkpEthAddressIsPermitted =
                await pkpPermissions.isPermittedAddress(tokenId, pkpEthAddress);
            expect(pkpEthAddressIsPermitted).to.equal(true);

            // check all the getters
            const permittedActions = await pkpPermissions.getPermittedActions(
                tokenId
            );
            // console.log("permittedActions: ", permittedActions);
            expect(permittedActions.length).to.equal(0);

            const permittedAddresses =
                await pkpPermissions.getPermittedAddresses(tokenId);
            expect(permittedAddresses).to.deep.equal([
                minter.address,
                pkpEthAddress,
            ]);

            const permittedAuthMethods =
                await pkpPermissions.getPermittedAuthMethods(tokenId);
            expect(permittedAuthMethods.length).to.equal(1);
        });
    });
});

import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { toNano, beginCell, Cell, Dictionary } from '@ton/core';
import { storeTokenBurn, storeTokenTransfer, TactJetton, JettonWallet, storeTokenUpdateContent } from '../wrappers/TactJetton';
import '@ton/test-utils';
import { buildOnchainMetadata, toKey, makeSnakeCell } from '../scripts/utils/stringBuilder';

describe('TactJetton', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tactJetton: SandboxContract<TactJetton>;

    const deployFee = "0.060"
    const mintFee = "0.085";
    const transferFee = "0.085";
    const burnFee = "0.035";
    const editFee = "0.010";

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        tactJetton = blockchain.openContract(
            await TactJetton.fromInit(
                deployer.address,
                beginCell()
                    .storeInt(1, 8)
                    .storeBuffer(Buffer.from('https://bitcoincash-example.github.io/website/logo.png'))
                    .endCell()
            ),
        );

        const deployResult = await tactJetton.send(
            deployer.getSender(),
            {
                value: toNano(deployFee),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tactJetton.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
    });

    it('should mint', async () => {
        const mintResult = await tactJetton.send(
            deployer.getSender(),
            {
                value: toNano(mintFee),
            },
            {
                $$type: 'Mint',
                queryId: 0n,
                amount: 1000000000000000000n,
                receiver: deployer.address,
            },
        );

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tactJetton.address,
            success: true,
        });

        const deployerJettonWallet = await tactJetton.getGetWalletAddress(deployer.address);
        const jettonWallet = blockchain.openContract(JettonWallet.JettonDefaultWallet.fromAddress(deployerJettonWallet));
        const { balance: minted } = await jettonWallet.getGetWalletData();
        expect(minted).toEqual(1000000000000000000n);

        printTransactionFees(mintResult.transactions)
    });

    it('should transfer', async () => {
        const user1 = await blockchain.treasury('user1');

        const mintResult = await tactJetton.send(
            deployer.getSender(),
            {
                value: toNano(mintFee),
            },
            {
                $$type: 'Mint',
                queryId: 0n,
                amount: 1000000000000000000n,
                receiver: deployer.address,
            },
        );

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tactJetton.address,
            success: true,
        });

        const deployerJettonWallet = await tactJetton.getGetWalletAddress(deployer.address);
        const jettonWallet = blockchain.openContract(JettonWallet.JettonDefaultWallet.fromAddress(deployerJettonWallet));
        const { balance: minted } = await jettonWallet.getGetWalletData();
        expect(minted).toEqual(1000000000000000000n);

        const userJettonWallet = await tactJetton.getGetWalletAddress(user1.address);
        const transferResult = await deployer.send(
            {
                value: toNano(transferFee),
                to: deployerJettonWallet,
                body: beginCell()
                    .store(
                        storeTokenTransfer({
                            $$type: 'TokenTransfer',
                            queryId: 123n,
                            amount: 1000000000000n,
                            destination: user1.address,
                            response_destination: deployer.address,
                            custom_payload: null,
                            forward_ton_amount: 1n,
                            forward_payload: Cell.EMPTY,
                        }),
                    )
                    .endCell(),
            }
        )

        expect(transferResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet,
            success: true,
        });
        expect(transferResult.transactions).toHaveTransaction({
            from: deployerJettonWallet,
            to: userJettonWallet,
            success: true,
        });
        printTransactionFees(transferResult.transactions)

    });

    it('should burn', async () => {
        const mintResult = await tactJetton.send(
            deployer.getSender(),
            {
                value: toNano(mintFee),
            },
            {
                $$type: 'Mint',
                queryId: 0n,
                amount: 1000000000000000000n,
                receiver: deployer.address,
            },
        );

        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tactJetton.address,
            success: true,
        });

        const deployerJettonWallet = await tactJetton.getGetWalletAddress(deployer.address);
        const jettonWallet = blockchain.openContract(JettonWallet.JettonDefaultWallet.fromAddress(deployerJettonWallet));
        const { balance: minted } = await jettonWallet.getGetWalletData();
        expect(minted).toEqual(1000000000000000000n);

        const burnResult = await deployer.send(
            {
                value: toNano(burnFee),
                to: deployerJettonWallet,
                body: beginCell()
                    .store(
                        storeTokenBurn({
                            $$type: 'TokenBurn',
                            queryId: 123n,
                            amount: 1000000000000n,
                            response_destination: deployer.address,
                        }),
                    )
                    .endCell(),
            }
        )

        expect(burnResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet,
            success: true,
        });
        expect(burnResult.transactions).toHaveTransaction({
            from: deployerJettonWallet,
            to: tactJetton.address,
            success: true,
        });
        printTransactionFees(burnResult.transactions)

    });

    it('should edit', async () => {
        const newContent = buildOnchainMetadata({
            name: "test",
            description: "test",
            image: "test",
            symbol: "TEST",
            decimals: "9"
        })
        const editResult = await deployer.send(
            {
                value: toNano(editFee),
                to: tactJetton.address,
                body: beginCell()
                    .store(
                        storeTokenUpdateContent({
                            $$type: 'TokenUpdateContent',
                            queryId: 123n,
                            content: newContent,
                        })
                    )
                    .endCell(),
            }
        )

        expect(editResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tactJetton.address,
            success: true,
        });

        const jettonMasterData = await tactJetton.getGetJettonData();
        expect(jettonMasterData.content.hash()).toEqual(newContent.hash());
        // console.log(jettonMasterData.content)
        // const dictData = Dictionary.load(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), jettonMasterData.content);
        // console.log(dictData)
        // const name = dictData.get(toKey("name"));
        // const description = dictData.get(toKey("description"));
        // const image = dictData.get(toKey("image"));
        // const symbol = dictData.get(toKey("symbol"));
        // const decimals = dictData.get(toKey("decimals"));

        // expect(name).toEqual(makeSnakeCell(Buffer.from("test", 'utf8')));
        // expect(description).toEqual(makeSnakeCell(Buffer.from("test", 'utf8')));
        // expect(image).toEqual(makeSnakeCell(Buffer.from("test", 'utf8')));
        // expect(symbol).toEqual(makeSnakeCell(Buffer.from("TEST", 'utf8')));
        // expect(decimals).toEqual(makeSnakeCell(Buffer.from("9", 'utf8')));

        printTransactionFees(editResult.transactions)

    });

});

import { HighloadWalletContract } from 'ton-highload-wallet-contract';
import { mnemonicToPrivateKey, KeyPair, mnemonicNew } from '@ton/crypto';
import { buildOnchainMetadata } from './utils/stringBuilder';
import {
    TactJetton, storeTokenTransfer,
    storeMint,
    storeDeploy,
    storeTokenUpdateContent,
    storeTokenBurn,
} from '../wrappers/TactJetton';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import { TonClient, OpenedContract, internal, beginCell, Address, JettonMaster, WalletContractV4, Cell } from '@ton/ton';
import Dotenv from 'dotenv';
import { BURN_FEE_NANO_TON, DEPLOY_FEE_NANO_TON, EDIT_FEE_NANO_TON, MINT_FEE_NANO_TON, TRANSFER_FEE_NANO_TON } from './utils/constants';
import { IJettonData, IMintParams, ITransferParams } from './utils/interfaces';
Dotenv.config({ path: `${__dirname}/.env` });

export async function createHighloadWalletInstance(mnemonic: string[]): Promise<{
    contract: OpenedContract<HighloadWalletContract>;
    key: KeyPair;
}> {
    const client = new TonClient({ endpoint: await getHttpEndpoint({ network: process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet' }) });
    const key = await mnemonicToPrivateKey(mnemonic);

    const contract = client.open(HighloadWalletContract.create({ publicKey: key.publicKey, workchain: 0 }));

    return {
        contract,
        key,
    };
}

export const deployJetton = async (data: IJettonData) => {
    if (!process.env.WALLET_MNEMONIC) {
        throw new Error('WALLET_MNEMONIC env var is not set');
    }

    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');

    const { contract, key } = await createHighloadWalletInstance(mnemonic);
    console.log(`Highload wallet created: ${contract.address}`);

    const seqno = await contract.getSeqno();
    console.log(`Highload wallet seqno: ${await contract.getSeqno()}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const balance = await contract.getBalance();
    console.log(`Highload wallet balance: ${balance} TON`);

    if (balance < DEPLOY_FEE_NANO_TON) {
        throw new Error(`Not enough balance (need ${DEPLOY_FEE_NANO_TON} TON, have ${balance})`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`Deploying jetton with data: ${JSON.stringify(data, null, 2)}`);
    const { init: stateInit, address: tactJettonAddress } = await TactJetton.fromInit(
        contract.address,
        buildOnchainMetadata(data),
    );

    await contract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
            internal({
                value: DEPLOY_FEE_NANO_TON,
                to: tactJettonAddress,
                bounce: false,
                init: stateInit,
                body: beginCell()
                    .store(
                        storeDeploy({
                            $$type: 'Deploy',
                            queryId: 0n,
                        }),
                    )
                    .endCell(),
            }),
        ],
    });

    console.log(`Jetton deployed: ${tactJettonAddress}`);
};

export const mint = async (jettonMasterAddress: string, targets: IMintParams[]) => {
    if (!process.env.WALLET_MNEMONIC) {
        throw new Error('WALLET_MNEMONIC env var is not set');
    }

    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');

    const { contract, key } = await createHighloadWalletInstance(mnemonic);
    console.log(`Highload wallet loaded: ${contract.address}`);

    const seqno = await contract.getSeqno();
    console.log(`Highload wallet seqno: ${seqno}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const balance = await contract.getBalance();
    const needs = BigInt(targets.length) * MINT_FEE_NANO_TON;
    if (balance < needs) {
        throw new Error(`Not enough balance: ${balance} < ${needs}`);
    }

    const messages = []
    let currentQueryId = 0n;
    for (const target of targets) {
        const { amount, to } = target;
        const toAddress = Address.parse(to);
        console.log(`* Minting ${amount} jettons to ${toAddress.toString()} (jettonMaster: ${jettonMasterAddress})`);
        const msg = internal({
            value: MINT_FEE_NANO_TON,
            to: jettonMasterAddress,
            bounce: true,
            body: beginCell()
                .store(
                    storeMint({
                        $$type: 'Mint',
                        queryId: 1000n + currentQueryId,
                        amount: amount,
                        receiver: toAddress,
                    }),
                )
                .endCell(),
        });

        messages.push(msg);
        currentQueryId += 1n;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await contract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: messages,
    });

    console.log(`Jetton minted.`);
};

export const transfer = async (jettonMasterAddress: string, targets: ITransferParams[]) => {
    if (!process.env.WALLET_MNEMONIC) {
        throw new Error('WALLET_MNEMONIC env var is not set');
    }

    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');

    const { contract, key } = await createHighloadWalletInstance(mnemonic);
    console.log(`Highload wallet loaded: ${contract.address}`);

    const seqno = await contract.getSeqno();
    console.log(`Highload wallet seqno: ${seqno}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const jettonMaster_address = Address.parse(jettonMasterAddress);
    const client = new TonClient({ endpoint: await getHttpEndpoint({ network: process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet' }) });
    const jettonMaster = client.open(JettonMaster.create(jettonMaster_address));
    const myJettonWalletAddress = await jettonMaster.getWalletAddress(contract.address);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const balance = await contract.getBalance();
    const needs = BigInt(targets.length) * TRANSFER_FEE_NANO_TON;
    if (balance < needs) {
        throw new Error(`Not enough balance: ${balance} < ${needs}`);
    }

    const messages = []
    let currentQueryId = 0n;
    for (const target of targets) {
        const { to, amount } = target;
        const toAddress = Address.parse(to);
        console.log(`* Transferring ${amount} jettons from ${contract.address} to ${toAddress.toString()}`);
        const msg = internal({
            value: TRANSFER_FEE_NANO_TON,
            to: myJettonWalletAddress,
            bounce: true,
            body: beginCell()
                .store(
                    storeTokenTransfer({
                        $$type: 'TokenTransfer',
                        queryId: 2000n + currentQueryId,
                        amount,
                        destination: toAddress,
                        response_destination: contract.address,
                        custom_payload: null,
                        forward_ton_amount: 1n,
                        forward_payload: Cell.EMPTY,
                    }),
                )
                .endCell(),
        });

        messages.push(msg);
        currentQueryId += 1n;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await contract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages,
    });
};

export const burn = async (jettonMasterAddress: string, amount: bigint) => {
    if (!process.env.WALLET_MNEMONIC) {
        throw new Error('WALLET_MNEMONIC env var is not set');
    }

    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');

    const { contract, key } = await createHighloadWalletInstance(mnemonic);
    console.log(`Highload wallet loaded: ${contract.address}`);

    const seqno = await contract.getSeqno();
    console.log(`Highload wallet seqno: ${seqno}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const jettonMaster_address = Address.parse(jettonMasterAddress);
    const client = new TonClient({ endpoint: await getHttpEndpoint({ network: process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet' }) });
    const jettonMaster = client.open(JettonMaster.create(jettonMaster_address));
    const myJettonWalletAddress = await jettonMaster.getWalletAddress(contract.address);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const balance = await contract.getBalance();
    if (balance < BURN_FEE_NANO_TON) {
        throw new Error(`Not enough balance: ${balance} < ${BURN_FEE_NANO_TON}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`* Burning ${amount} jettons from ${contract.address} (jetton master: ${jettonMaster_address.toString()})`);
    await contract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
            internal({
                value: BURN_FEE_NANO_TON,
                to: myJettonWalletAddress,
                bounce: true,
                body: beginCell()
                    .store(
                        storeTokenBurn({
                            $$type: 'TokenBurn',
                            queryId: 3n,
                            amount,
                            response_destination: contract.address,
                        }),
                    )
                    .endCell(),
            }),
        ],
    });
};

export const edit = async (jettonMasterAddress: string, data: IJettonData) => {
    if (!process.env.WALLET_MNEMONIC) {
        throw new Error('WALLET_MNEMONIC env var is not set');
    }

    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');

    const { contract, key } = await createHighloadWalletInstance(mnemonic);
    console.log(`Highload wallet loaded: ${contract.address}`);

    const seqno = await contract.getSeqno();
    console.log(`Highload wallet seqno: ${seqno}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`* Editing jetton master ${jettonMasterAddress} with ${JSON.stringify(data)}`);
    const msg = internal({
        value: EDIT_FEE_NANO_TON,
        to: jettonMasterAddress,
        bounce: true,
        body: beginCell()
            .store(
                storeTokenUpdateContent({
                    $$type: 'TokenUpdateContent',
                    queryId: 4n,
                    content: buildOnchainMetadata(data),
                })
            )
            .endCell(),
    });

    await contract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [msg],
    });

    console.log(`* Done editing jetton master ${jettonMasterAddress}`);
}



export interface IJettonData {
    name: string;
    description: string;
    image: string;
    symbol: string;
    decimals: string;
}

export interface IMintParams {
    to: string;
    amount: bigint;
}

export interface ITransferParams {
    to: string;
    amount: bigint;
}

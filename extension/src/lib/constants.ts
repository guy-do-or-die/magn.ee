import { zeroAddress } from 'viem';
import { mainnet, optimism, base, arbitrum } from 'viem/chains';

export const ZERO_ADDRESS = zeroAddress;
export const DEFAULT_SOURCE_CHAIN_ID = optimism.id;

export interface Chain {
    id: number;
    name: string;
    key: string; // for Li.Fi
    icon: string;
}

export interface Token {
    address: string;
    symbol: string;
    decimals: number;
    chainId: number;
    name: string;
    icon?: string;
}

export const SUPPORTED_CHAINS: Chain[] = [
    { id: mainnet.id, name: 'Ethereum', key: 'eth', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/ethereum.svg' },
    { id: optimism.id, name: 'Optimism', key: 'opt', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/optimism.svg' },
    { id: base.id, name: 'Base', key: 'base', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/base.svg' },
    { id: arbitrum.id, name: 'Arbitrum', key: 'arb', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/arbitrum.svg' }
];

export const POPULAR_TOKENS: Token[] = [
    {
        chainId: mainnet.id,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: mainnet.id,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    },
    {
        chainId: optimism.id,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: optimism.id,
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native USDC on Optimism
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    },
    {
        chainId: base.id,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: base.id,
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    },
    {
        chainId: arbitrum.id,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: arbitrum.id,
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    }
];

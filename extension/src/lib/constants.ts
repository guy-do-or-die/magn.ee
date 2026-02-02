import { zeroAddress } from 'viem';

export const ZERO_ADDRESS = zeroAddress;
export const DEFAULT_SOURCE_CHAIN_ID = 10; // Optimism

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
    { id: 1, name: 'Ethereum', key: 'eth', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/ethereum.svg' },
    { id: 10, name: 'Optimism', key: 'opt', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/optimism.svg' },
    { id: 8453, name: 'Base', key: 'base', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/base.svg' },
    { id: 42161, name: 'Arbitrum', key: 'arb', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/arbitrum.svg' }
];

export const POPULAR_TOKENS: Token[] = [
    {
        chainId: 1,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: 1,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    },
    {
        chainId: 10,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: 10,
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native USDC on Optimism
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    },
    {
        chainId: 8453,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: 8453,
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    },
    {
        chainId: 42161,
        address: ZERO_ADDRESS,
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
    },
    {
        chainId: 42161,
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
    }
];

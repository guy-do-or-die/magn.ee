/**
 * Aave Supply Detector
 * 
 * Recognizes Aave V3 supply(address,uint256,address,uint16) calls.
 * Token address is the first argument, amount is the second.
 * The target contract (tx.to) is the Aave Pool — needs token approval.
 */

import { parseAbi, toHex, formatUnits } from 'viem';
import type { ActionDetector, DetectedAction, RawTx } from './types';

// Well-known tokens across supported chains (lowercase)
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
    // ── USDC ──
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', decimals: 6 },  // Optimism
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },  // Base
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6 },  // Arbitrum
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },  // Mainnet
    // ── USDT ──
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', decimals: 6 },  // Optimism
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6 },  // Arbitrum
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },  // Mainnet
    // ── WETH ──
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },  // Optimism & Base
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', decimals: 18 },  // Arbitrum
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },  // Mainnet
    // ── DAI ──
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },   // Optimism & Arbitrum
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },   // Base
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },   // Mainnet
};

function resolveToken(address: string): { symbol: string; decimals: number } {
    return KNOWN_TOKENS[address.toLowerCase()] ?? { symbol: address.slice(0, 6) + '…', decimals: 18 };
}

const abi = parseAbi([
    'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
]);

export const aaveSupply: ActionDetector = {
    name: 'Aave Supply',
    abi,

    analyze(functionName: string, args: readonly any[], tx: RawTx): DetectedAction | null {
        if (functionName !== 'supply') return null;

        const [asset, amount, onBehalfOf] = args as [string, bigint, string];
        const token = resolveToken(asset);
        const formatted = formatUnits(amount, token.decimals);
        const shortAddr = `${onBehalfOf.slice(0, 6)}…${onBehalfOf.slice(-4)}`;
        return {
            type: 'Aave Supply',
            shouldIntercept: true,
            tokenAddress: asset,
            tokenAmount: toHex(amount),
            spender: tx.to,
            description: `Supply ${formatted} ${token.symbol} on behalf of ${shortAddr}`,
            originalCalldata: tx.data,
        };
    },
};

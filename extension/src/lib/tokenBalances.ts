/**
 * Token Balance Utilities using Li.Fi SDK
 * Fetches tokens with balances and caches results to avoid excessive API calls
 */

import { getTokens, getTokenBalancesByChain } from '@lifi/sdk';
import type { Token, TokenAmount } from '@lifi/sdk';

export interface TokenWithBalance extends Token {
    balance?: string; // Raw balance as string
    balanceUSD?: string; // USD value of balance
    formattedBalance?: string; // Human-readable balance (e.g., "1.234")
}

interface TokenCache {
    tokens: TokenWithBalance[];
    timestamp: number;
    walletAddress: string;
    chainIds: number[];
}

const CACHE_TTL = 30_000; // 30 seconds
let cache: TokenCache | null = null;

/**
 * Fetch all tokens for selected chains with non-zero balances
 * Results are cached for 30 seconds to avoid excessive API calls
 */
export async function getTokensWithBalances(
    walletAddress: string,
    chainIds: number[]
): Promise<TokenWithBalance[]> {
    // Check cache
    if (cache && 
        cache.walletAddress === walletAddress && 
        JSON.stringify(cache.chainIds.sort()) === JSON.stringify(chainIds.sort()) &&
        Date.now() - cache.timestamp < CACHE_TTL
    ) {
        console.log('[TokenBalances] Returning cached tokens');
        return cache.tokens;
    }

    console.log('[TokenBalances] Fetching tokens for chains:', chainIds);

    try {
        // 1. Fetch all available tokens for selected chains
        const tokensResponse = await getTokens({ chains: chainIds });
        console.log('[TokenBalances] Tokens response:', tokensResponse);

        // 2. Organize tokens by chain
        const tokensByChain: { [chainId: number]: Token[] } = {};
        for (const chainId of chainIds) {
            const chainTokens = tokensResponse.tokens[chainId] || [];
            if (chainTokens.length > 0) {
                tokensByChain[chainId] = chainTokens;
            }
        }

        // 3. Fetch balances for all tokens
        console.log('[TokenBalances] Fetching balances for wallet:', walletAddress);
        const balancesResponse = await getTokenBalancesByChain(walletAddress, tokensByChain);
        console.log('[TokenBalances] Balances response:', balancesResponse);

        // 4. Map tokens with their balances
        const tokensWithBalances: TokenWithBalance[] = [];
        
        for (const chainId of chainIds) {
            const chainTokens = tokensByChain[chainId] || [];
            const chainBalances = balancesResponse[chainId] || [];

            for (const token of chainTokens) {
                const tokenBalance = chainBalances.find(
                    (b: TokenAmount) => b.address?.toLowerCase() === token.address?.toLowerCase()
                );

                // Only include tokens with non-zero balance
                if (tokenBalance && tokenBalance.amount && BigInt(tokenBalance.amount) > 0n) {
                    const balance = tokenBalance.amount;
                    const decimals = token.decimals || 18;
                    const priceUSD = parseFloat(token.priceUSD || '0');

                    // Calculate formatted balance - convert string to bigint for calculations
                    const balanceBigInt = BigInt(balance);
                    const formattedBalance = formatTokenBalance(balanceBigInt, decimals);
                    
                    // Calculate USD value
                    const balanceFloat = Number(balanceBigInt) / Math.pow(10, decimals);
                    const balanceUSD = (balanceFloat * priceUSD).toFixed(2);

                    tokensWithBalances.push({
                        ...token,
                        balance: balance, // Keep as string
                        balanceUSD,
                        formattedBalance,
                    });
                }
            }
        }

        // 5. Sort by USD value (highest first)
        tokensWithBalances.sort((a, b) => {
            const aVal = parseFloat(a.balanceUSD || '0');
            const bVal = parseFloat(b.balanceUSD || '0');
            return bVal - aVal;
        });

        // 6. Cache results
        cache = {
            tokens: tokensWithBalances,
            timestamp: Date.now(),
            walletAddress,
            chainIds,
        };

        console.log('[TokenBalances] Fetched', tokensWithBalances.length, 'tokens with balance');
        return tokensWithBalances;

    } catch (error) {
        console.error('[TokenBalances] Error fetching tokens:', error);
        return [];
    }
}

/**
 * Get tokens above a minimum USD value threshold
 */
export async function getTokensAboveValue(
    walletAddress: string,
    chainIds: number[],
    minValueUSD: string
): Promise<TokenWithBalance[]> {
    const tokens = await getTokensWithBalances(walletAddress, chainIds);
    const minValue = parseFloat(minValueUSD);
    
    return tokens.filter(token => {
        const value = parseFloat(token.balanceUSD || '0');
        return value >= minValue;
    });
}

/**
 * Format token balance for display (e.g., "1.234" or "1,234.56")
 */
function formatTokenBalance(balance: bigint, decimals: number): string {
    const balanceFloat = Number(balance) / Math.pow(10, decimals);
    
    // For very small amounts, show more decimals
    if (balanceFloat < 0.01) {
        return balanceFloat.toFixed(6);
    }
    // For normal amounts, show 2-4 decimals
    if (balanceFloat < 1) {
        return balanceFloat.toFixed(4);
    }
    // For larger amounts, show 2 decimals with commas
    return balanceFloat.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Clear the token balance cache (useful for manual refresh)
 */
export function clearTokenBalanceCache(): void {
    cache = null;
    console.log('[TokenBalances] Cache cleared');
}

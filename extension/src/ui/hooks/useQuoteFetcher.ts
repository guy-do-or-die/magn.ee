import { useState } from 'react';
import { fetchLiFiQuote } from '@/lib/lifi';
import { Route } from '@/injected/magneeUtils';
import { ZERO_ADDRESS } from '@/lib/constants';

interface UseQuoteFetcherParams {
    sourceChainId: number;
    sourceTokenAddress: string;
    tx: any;
}

export function useQuoteFetcher({ sourceChainId, sourceTokenAddress, tx }: UseQuoteFetcherParams) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [routes, setRoutes] = useState<Route[]>([]);

    const fetchQuotes = async () => {
        if (!tx) return [];
        setLoading(true);
        setError(null);
        setRoutes([]);

        try {
            const currentChain = sourceChainId;
            const targetChain = tx.chainId;
            const generatedRoutes: Route[] = [];

            const effectiveTargetChain = targetChain;
            const effectiveTargetAddress = tx.to;

            console.log(`[Magnee] Fetching Li.Fi Quote from ${currentChain} -> ${effectiveTargetChain}`);

            const amountDecimal = BigInt(tx.value).toString();

            const quote = await fetchLiFiQuote({
                fromChain: currentChain,
                fromToken: sourceTokenAddress,
                fromAddress: tx.from || ZERO_ADDRESS,
                toChain: effectiveTargetChain,
                toToken: ZERO_ADDRESS,
                toAmount: amountDecimal,
                integrator: 'Magnee',
                contractCalls: [{
                    fromAmount: amountDecimal,
                    fromTokenAddress: ZERO_ADDRESS,
                    toContractAddress: effectiveTargetAddress,
                    toContractCallData: tx.data || '0x',
                    toContractGasLimit: '150000'
                }]
            });

            // Build approval tx if needed (for ERC20 tokens when approval address is present)
            let approvalTx: { to: string; data: string } | undefined;
            if (quote.estimate.approvalAddress && sourceTokenAddress !== ZERO_ADDRESS) {
                // Encode ERC20 approve(spender, amount)
                const { encodeFunctionData } = await import('viem');
                approvalTx = {
                    to: sourceTokenAddress,
                    data: encodeFunctionData({
                        abi: [{
                            inputs: [
                                { name: 'spender', type: 'address' },
                                { name: 'amount', type: 'uint256' }
                            ],
                            name: 'approve',
                            outputs: [{ name: '', type: 'bool' }],
                            stateMutability: 'nonpayable',
                            type: 'function'
                        }],
                        functionName: 'approve',
                        args: [quote.estimate.approvalAddress as `0x${string}`, BigInt(quote.estimate.fromAmount)]
                    })
                };
                console.log('[Magnee] Generated approvalTx for 7702 batch:', approvalTx.to);
            }

            generatedRoutes.push({
                id: 'route-lifi-real',
                title: `Bridge via Li.Fi (${(Number(quote.estimate.fromAmount) / Math.pow(10, quote.action.fromToken.decimals)).toFixed(6)} ${quote.action.fromToken.symbol})`,
                tokenIn: sourceTokenAddress,
                amountIn: quote.estimate.fromAmount,
                tokenOut: effectiveTargetAddress,
                chainId: currentChain,
                strategy: 'LIFI_BRIDGE',
                calldata: quote.transactionRequest.data,
                targetAddress: quote.transactionRequest.to,
                targetData: tx.data,
                auxData: '0x',
                txValue: quote.transactionRequest.value,
                amountUSD: quote.estimate.fromAmountUSD,
                approvalTx  // Include for 7702 batching
            });

            setRoutes(generatedRoutes);
            return generatedRoutes;

        } catch (err) {
            console.error(err);
            const debugInfo = ` [Params: Chain=${sourceChainId}, Token=${sourceTokenAddress}, From=${tx.from}]`;
            setError('Failed to fetch quotes: ' + (err as Error).message + debugInfo);
            return [];
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        error,
        routes,
        fetchQuotes
    };
}

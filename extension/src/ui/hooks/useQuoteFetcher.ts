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
                amountUSD: quote.estimate.fromAmountUSD
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

import { useState } from 'react';
import { fetchLiFiQuote } from '@/lib/lifi';
import { Route, encodeExecuteSingle, encodeExecuteWithSignature } from '@/injected/magneeUtils';
import { ZERO_ADDRESS } from '@/lib/constants';
import { signExecuteTypedData } from '@/lib/walletBridge';

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

            // ── EIP-712 Signature for cross-chain authorization ──
            // Generate nonce and deadline, then sign execution params
            const nonce = `0x${Date.now().toString(16)}`;
            const deadline = `0x${(Math.floor(Date.now() / 1000) + 3600).toString(16)}`; // 1 hour
            
            let contractCallData: string;
            
            const sigResult = await signExecuteTypedData({
                from: tx.from,
                chainId: effectiveTargetChain,
                verifyingContract: tx.from, // EOA = verifyingContract in EIP-7702
                target: effectiveTargetAddress,
                value: tx.value || '0x0',
                data: tx.data || '0x',
                nonce,
                deadline,
            });

            if (sigResult.ok && sigResult.result) {
                console.log('[Magnee] EIP-712 signature obtained for cross-chain auth');
                contractCallData = encodeExecuteWithSignature(
                    effectiveTargetAddress,
                    tx.value || '0x0',
                    tx.data || '0x',
                    nonce,
                    deadline,
                    sigResult.result
                );
            } else {
                console.warn('[Magnee] EIP-712 signing failed, falling back to unsigned executeSingle:', sigResult.error);
                contractCallData = encodeExecuteSingle(
                    effectiveTargetAddress,
                    tx.value || '0x0',
                    tx.data || '0x'
                );
            }

            const contractCall = {
                fromAmount: amountDecimal,
                fromTokenAddress: ZERO_ADDRESS,
                toContractAddress: tx.from,  // User's EOA (pre-delegated)
                toContractCallData: contractCallData,
                toContractGasLimit: '600000'  // Slightly higher for sig verification
            };

            const quote = await fetchLiFiQuote({
                fromChain: currentChain,
                fromToken: sourceTokenAddress,
                fromAddress: tx.from || ZERO_ADDRESS,
                toChain: effectiveTargetChain,
                toToken: ZERO_ADDRESS,
                toAmount: amountDecimal,
                integrator: 'Magnee',
                contractCalls: [contractCall]
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
                approvalTx,  // Include for 7702 batching
                lifiStep: quote._step,  // Li.Fi SDK step for executeRoute()
                lifiContractCalls: [contractCall],
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

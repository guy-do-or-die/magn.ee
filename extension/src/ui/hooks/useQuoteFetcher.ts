/**
 * Quote Fetcher Hook
 * 
 * Fetches Li.Fi cross-chain quotes using the detected action
 * and batch builder to construct the destination execution.
 * 
 * Flow:
 *   1. Use DetectedAction from the intercepted tx
 *   2. Build destination batch (approve + action if ERC-20)
 *   3. Sign EIP-712 for the outer call
 *   4. Request Li.Fi quote with contractCalls
 */

import { useState } from 'react';
import { fetchLiFiQuote } from '@/lib/lifi';
import { Route, encodeExecuteSingle, encodeExecuteWithSignature } from '@/injected/magneeUtils';
import { ZERO_ADDRESS } from '@/lib/constants';
import { signExecuteTypedData } from '@/lib/walletBridge';
import { loadSettings } from '@/lib/settings';
import { buildDestinationBatch } from '@/lib/batchBuilder';
import type { DetectedAction } from '@/lib/actions';

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
            // Load user settings for slippage / gas limit
            const userSettings = await loadSettings();
            const slippage = userSettings.slippage / 10000; // bps -> 0-1 range
            const gasLimitMultiplier = userSettings.gasLimit;

            const currentChain = sourceChainId;
            const targetChain = tx.chainId;
            const generatedRoutes: Route[] = [];

            // ── Build destination batch from detected action ────────
            const action: DetectedAction | undefined = tx.detectedAction;
            const batch = buildDestinationBatch(
                tx.from,
                action ?? {
                    type: 'Unknown',
                    shouldIntercept: true,
                    tokenAddress: ZERO_ADDRESS,
                    tokenAmount: tx.value || '0x0',
                    description: 'Unknown transaction',
                    originalCalldata: tx.data || '0x',
                },
                { to: tx.to, value: tx.value || '0x0', data: tx.data || '0x' },
            );

            console.log(`[Magnee] Fetching Li.Fi Quote from ${currentChain} -> ${targetChain}`);
            console.log('[Magnee] Detected action:', action ? action.type : 'NONE', action);
            console.log('[Magnee] Destination batch:', batch.isBatch ? `${batch.calls.length} calls` : 'single call');

            // ── Determine amounts for Li.Fi ─────────────────────────
            // For ETH: use tx.value as the amount to bridge
            // For ERC-20: use the token amount from the detected action
            const isNativeToken = !action || action.tokenAddress === ZERO_ADDRESS;
            const rawAmount = isNativeToken
                ? BigInt(tx.value || '0')
                : BigInt(action.tokenAmount);
            const bridgeAmount = rawAmount > 0n ? rawAmount.toString() : BigInt(tx.value || '0').toString();
            console.log('[Magnee] Bridge amount:', bridgeAmount, 'isNative:', isNativeToken);

            // ── EIP-712 Signature for cross-chain authorization ─────
            const nonce = `0x${Date.now().toString(16)}`;
            const deadline = `0x${(Math.floor(Date.now() / 1000) + 3600).toString(16)}`; // 1 hour

            let contractCallData: string;

            const sigResult = await signExecuteTypedData({
                from: tx.from,
                chainId: targetChain,
                verifyingContract: tx.from, // EOA = verifyingContract in EIP-7702
                target: batch.outerTarget,  // EOA (self-call) or direct target
                value: `0x${batch.outerValue.toString(16)}`,
                data: batch.outerData,
                nonce,
                deadline,
            });

            if (sigResult.ok && sigResult.result) {
                console.log('[Magnee] EIP-712 signature obtained for cross-chain auth');
                contractCallData = encodeExecuteWithSignature(
                    batch.outerTarget,
                    `0x${batch.outerValue.toString(16)}`,
                    batch.outerData,
                    nonce,
                    deadline,
                    sigResult.result
                );
            } else {
                console.warn('[Magnee] EIP-712 signing failed, falling back to unsigned executeSingle:', sigResult.error);
                contractCallData = encodeExecuteSingle(
                    batch.outerTarget,
                    `0x${batch.outerValue.toString(16)}`,
                    batch.outerData
                );
            }

            // ── Li.Fi Quote ─────────────────────────────────────────
            const baseGasLimit = batch.isBatch ? 800000 : 600000; // batches need more gas
            const effectiveGasLimit = gasLimitMultiplier
                ? Math.round(baseGasLimit * gasLimitMultiplier).toString()
                : baseGasLimit.toString();

            // Determine destination token for Li.Fi
            // For ERC-20 batches: bridge the actual token to the destination
            // For native ETH: bridge native token
            const destinationToken = isNativeToken ? ZERO_ADDRESS : action.tokenAddress;

            const contractCall = {
                fromAmount: bridgeAmount,
                fromTokenAddress: destinationToken,  // Token the contract expects (USDC for ERC-20, ETH for native)
                toContractAddress: tx.from,  // User's EOA (pre-delegated)
                toContractCallData: contractCallData,
                toContractGasLimit: effectiveGasLimit,
            };

            const quote = await fetchLiFiQuote({
                fromChain: currentChain,
                fromToken: sourceTokenAddress,
                fromAddress: tx.from || ZERO_ADDRESS,
                toChain: targetChain,
                toToken: destinationToken,
                toAmount: bridgeAmount,
                integrator: 'Magnee',
                contractCalls: [contractCall],
                slippage,
                gasLimitMultiplier,
            });

            // Build approval tx if needed on SOURCE chain
            // (for when user pays with ERC-20 on source chain)
            let approvalTx: { to: string; data: string } | undefined;
            if (quote.estimate.approvalAddress && sourceTokenAddress !== ZERO_ADDRESS) {
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
                console.log('[Magnee] Generated source chain approvalTx:', approvalTx.to);
            }

            // ── Build Route ─────────────────────────────────────────
            const actionLabel = action?.type ?? 'Transaction';
            const tokenSymbol = quote.action.fromToken.symbol;
            const tokenAmount = (Number(quote.estimate.fromAmount) / Math.pow(10, quote.action.fromToken.decimals)).toFixed(6);

            generatedRoutes.push({
                id: 'route-lifi-real',
                title: `${actionLabel} via Li.Fi (${tokenAmount} ${tokenSymbol})`,
                tokenIn: sourceTokenAddress,
                amountIn: quote.estimate.fromAmount,
                tokenOut: tx.to,
                chainId: currentChain,
                strategy: 'LIFI_BRIDGE',
                calldata: quote.transactionRequest.data,
                targetAddress: quote.transactionRequest.to,
                targetData: tx.data,
                auxData: '0x',
                txValue: quote.transactionRequest.value,
                amountUSD: quote.estimate.fromAmountUSD,
                approvalTx,
                lifiStep: quote._step,
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

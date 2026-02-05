import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';

import { PaymentRequestHeader } from './features/PaymentRequestHeader';
import { QuoteConfigurator } from './features/QuoteConfigurator';
import { QuoteList } from './features/QuoteList';
import { QuoteReview } from './features/QuoteReview';
import { ExecutionProgress, ExecutionStatus } from './features/ExecutionProgress';

import { useQuoteFetcher } from './hooks/useQuoteFetcher';
import { useApproval } from './hooks/useApproval';
import { initLiFiSDK } from '@/lib/lifi';

import { Route } from '@/injected/magneeUtils';
import { ZERO_ADDRESS, DEFAULT_SOURCE_CHAIN_ID, SUPPORTED_CHAINS, POPULAR_TOKENS } from '@/lib/constants';
import './global.css';

type Step = 'CONFIG' | 'LOADING' | 'SELECT' | 'CONFIRM' | 'EXECUTING' | 'STATUS';

export default function App() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tx, setTx] = useState<{ to: string; value: string; data: string; chainId?: number; from?: string } | null>(null);
    const [reqId, setReqId] = useState<string | null>(null);
    const [step, setStep] = useState<Step>('CONFIG');

    // State for Configurator
    const [sourceChainId, setSourceChainId] = useState<number>(DEFAULT_SOURCE_CHAIN_ID);
    const [sourceTokenAddress, setSourceTokenAddress] = useState<string>('');

    // Hooks
    const {
        loading: quotesLoading,
        error: quotesError,
        routes,
        fetchQuotes: executeFetchQuotes
    } = useQuoteFetcher({ sourceChainId, sourceTokenAddress, tx });

    const {
        needsApproval,
        approving,
        checkAllowance,
        triggerApproval,
        setNeedsApproval
    } = useApproval();

    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

    // Execution tracking state
    const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>({
        step: 0,
        total: 0,
        status: 'pending',
        message: ''
    });

    // Original chain for restoration on close/back
    const [originalChainId, setOriginalChainId] = useState<number | null>(null);

    // Function to restore original chain
    const restoreOriginalChain = useCallback(async () => {
        if (originalChainId && window.ethereum) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: `0x${originalChainId.toString(16)}` }]
                });
                console.log('[Magnee] Restored original chain:', originalChainId);
            } catch (err) {
                console.warn('[Magnee] Failed to restore chain:', err);
            }
        }
    }, [originalChainId]);

    // Initialize SDK and save original chain
    useEffect(() => {
        const init = async () => {
            // Save original chain for restoration
            if (window.ethereum) {
                try {
                    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                    const chainId = parseInt(chainIdHex as string, 16);
                    setOriginalChainId(chainId);
                    console.log('[Magnee] Saved original chain:', chainId);

                    // Initialize Li.Fi SDK
                    initLiFiSDK(window.ethereum);
                } catch (err) {
                    console.warn('[Magnee] Failed to get chain:', err);
                }
            }
        };
        init();
    }, []);

    // Load TX details
    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const id = queryParams.get('id');

        if (!id) {
            setError('No Request ID provided');
            setLoading(false);
            return;
        }

        setReqId(id);

        chrome.runtime.sendMessage({ type: 'GET_TX_DETAILS', id }, (response) => {
            console.log('[Magnee UI] Received TX Details:', response);
            if (!response || response.error) {
                setError(response?.error || 'Failed to fetch transaction details');
            } else {
                setTx(response);

                const detectedChainId = response.chainId || DEFAULT_SOURCE_CHAIN_ID;
                const isSupported = SUPPORTED_CHAINS.some(c => c.id === detectedChainId);
                const defaultChain = isSupported ? detectedChainId : DEFAULT_SOURCE_CHAIN_ID;

                setSourceChainId(defaultChain);
                setSourceTokenAddress(ZERO_ADDRESS); // Default Native ETH
            }
            setLoading(false);
        });
    }, []);

    const handleFetchQuotes = async () => {
        // Safety Check: Ensure Source Chain matches Token Chain
        // This prevents the "Impossible State" where we try to use an OP token on Base
        const tokenConfig = POPULAR_TOKENS.find(t => t.address === sourceTokenAddress);
        let effectiveChainId = sourceChainId;

        if (tokenConfig && tokenConfig.chainId !== sourceChainId) {
            console.warn(`[Magnee] Chain Mismatch detected! Token is on ${tokenConfig.chainId}, but Config is ${sourceChainId}. correcting...`);
            effectiveChainId = tokenConfig.chainId;
            setSourceChainId(effectiveChainId);
        }

        console.log(`[Magnee] Fetching Quotes. Chain: ${effectiveChainId}, Token: ${sourceTokenAddress}`);

        setStep('LOADING');
        if (effectiveChainId !== sourceChainId) {
            alert("Configuration corrected. Please click Find Routes again.");
            setStep('CONFIG');
            return;
        }

        const results = await executeFetchQuotes();
        if (results && results.length > 0) {
            setStep('SELECT');
        } else {
            setStep('CONFIG');
        }
    };

    const handleSelectRoute = async (r: Route) => {
        setSelectedRoute(r);
        setStep('CONFIRM');

        // Check Approval Logic - skip if 7702 batching is available
        if (tx && tx.from && r.strategy === 'LIFI_BRIDGE') {
            // Import delegation check
            const { supportsDelegation } = await import('@/lib/delegates');
            
            // If chain supports 7702 AND we have approvalTx, we'll batch it - no separate approval needed
            if (r.approvalTx && supportsDelegation(r.chainId)) {
                console.log('[Magnee] 7702 batching available - skipping separate approval step');
                setNeedsApproval(false);
            } else {
                // Standard flow: check allowance and prompt for approval if needed
                const hasAllowance = await checkAllowance(r.tokenIn, tx.from, r.targetAddress || '', BigInt(r.amountIn));
                setNeedsApproval(!hasAllowance);
                console.log('[Magnee] Route Selection - Needs Approval?', !hasAllowance);
            }
        } else {
            setNeedsApproval(false);
        }
    };

    const handleDecision = (action: 'MAGNEEFY' | 'CONTINUE' | 'REJECT', route?: Route) => {
        if (!reqId) return;
        const payloadRoute = action === 'MAGNEEFY' ? (route || selectedRoute) : undefined;
        chrome.runtime.sendMessage({
            type: 'MAGNEE_DECISION',
            payload: { id: reqId, action, route: payloadRoute }
        });

        if (action === 'REJECT') {
            window.close();
        } else {
            setStep('STATUS');
        }
    };

    const handleApprove = () => {
        if (!selectedRoute || !tx?.from || !reqId) return;
        triggerApproval(tx.from, selectedRoute, reqId);
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;

    // Global Error Layout
    if (error || quotesError) return (
        <div className="p-4 bg-red-50 text-red-600">
            <h3 className="font-bold">Error</h3>
            <p>{error || quotesError}</p>
            <Button variant="outline" onClick={() => { setError(null); setStep('CONFIG'); }} className="mt-4">Back</Button>
        </div>
    );

    return (
        <div className="flex h-full w-full flex-col bg-gray-50 font-sans antialiased overflow-hidden">
            <Card className="flex h-full flex-col border-none shadow-none rounded-none">
                <CardHeader className="bg-white pb-3 pt-5 text-center border-b shrink-0">
                    <CardTitle className="text-lg flex items-center justify-center gap-2">
                        <img src="/icons/128.png" className="w-6 h-6" /> Magnee
                    </CardTitle>
                    <CardDescription className="text-xs">Payment Interceptor</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto bg-gray-50/50 p-4 space-y-4">

                    <PaymentRequestHeader tx={tx} />

                    {step === 'CONFIG' && (
                        <QuoteConfigurator
                            sourceChainId={sourceChainId}
                            setSourceChainId={setSourceChainId}
                            sourceTokenAddress={sourceTokenAddress}
                            setSourceTokenAddress={setSourceTokenAddress}
                            onFetchQuotes={handleFetchQuotes}
                        />
                    )}

                    {step === 'LOADING' && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            <p className="text-sm text-gray-500">Searching for best routes...</p>
                        </div>
                    )}

                    {step === 'SELECT' && (
                        <QuoteList
                            routes={routes}
                            onSelectRoute={handleSelectRoute}
                            onBack={() => { restoreOriginalChain(); setStep('CONFIG'); }}
                        />
                    )}

                    {step === 'CONFIRM' && selectedRoute && (
                        <QuoteReview
                            tx={tx}
                            selectedRoute={selectedRoute}
                            needsApproval={needsApproval}
                            approving={approving}
                            onApprove={handleApprove}
                            onConfirm={() => handleDecision('MAGNEEFY')}
                            onBack={() => { restoreOriginalChain(); setStep('SELECT'); }}
                        />
                    )}

                    {step === 'STATUS' && (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
                            <ExecutionProgress status={executionStatus} />
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    {executionStatus.status === 'done' ? 'Complete!' : 'Check your Wallet'}
                                </h3>
                                {executionStatus.status !== 'done' && (
                                    <p className="text-sm text-gray-500 mt-1">Please sign the transaction in your wallet to proceed.</p>
                                )}
                            </div>
                            <Button onClick={() => { restoreOriginalChain(); window.close(); }} variant="outline" className="mt-4">
                                Close
                            </Button>
                        </div>
                    )}

                </CardContent>

                <CardFooter className="flex-col gap-2.5 bg-white border-t p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                    <Button
                        variant="ghost"
                        className="w-full text-gray-500 hover:bg-gray-50 h-8 text-xs"
                        onClick={() => handleDecision('CONTINUE')}
                    >
                        Skip & Pass Original
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full text-red-400 hover:text-red-500 h-6 text-[10px]"
                        onClick={() => handleDecision('REJECT')}
                    >
                        Reject Transaction
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

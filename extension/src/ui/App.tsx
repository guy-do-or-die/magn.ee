import { useEffect, useState, useCallback } from 'react';
import { Button } from '@magnee/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@magnee/ui/components/card';

import { Header } from './components/Header';
import { PaymentRequestHeader } from './features/PaymentRequestHeader';
import { QuoteConfigurator } from './features/QuoteConfigurator';
import { QuoteList } from './features/QuoteList';
import { QuoteReview } from './features/QuoteReview';
import { ExecutionProgress, ExecutionStatus, TxLink } from './features/ExecutionProgress';

import { useQuoteFetcher } from './hooks/useQuoteFetcher';
import { useApproval } from './hooks/useApproval';
import { initLiFiSDK } from '@/lib/lifi';

import { Route } from '@/injected/magneeUtils';
import { ZERO_ADDRESS, DEFAULT_SOURCE_CHAIN_ID, SUPPORTED_CHAINS, POPULAR_TOKENS, getExplorerTxUrl, getExplorerAddressUrl, getExplorerName } from '@/lib/constants';
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
        message: '',
        history: [],
        txLinks: []
    });

    // Listen for execution status updates from content script
    useEffect(() => {
        const listener = (message: any) => {
            if (message.type === 'MAGNEE_TX_STATUS') {
                console.log('[Magnee UI] Status update:', message.payload);
                const { message: msg, status } = message.payload;
                
                setExecutionStatus(prev => {
                    // Avoid duplicate messages
                    if (prev.history.includes(msg)) return prev;
                    
                    return {
                        ...prev,
                        status: status === 'CONFIRMED' || status === 'SUCCESS' ? 'done' : 
                                status === 'FAILED' ? 'failed' : 'in_progress',
                        message: msg,
                        history: [...prev.history, msg]
                    };
                });
            }
            if (message.type === 'MAGNEEFY_COMPLETED') {
                console.log('[Magnee UI] Completed:', message.payload);
                const { txHash, sourceChainId, destChainId } = message.payload;
                
                // Build explorer links
                const links: TxLink[] = [];
                if (txHash && sourceChainId) {
                    const url = getExplorerTxUrl(sourceChainId, txHash);
                    if (url) links.push({ label: `Source tx on ${getExplorerName(sourceChainId)}`, url });
                }
                if (txHash) {
                    // LiFi scan tracks bridge delivery to destination chain
                    links.push({ label: 'Track bridge delivery on Li.Fi', url: `https://scan.li.fi/tx/${txHash}` });
                }
                if (tx?.to && destChainId) {
                    const addressUrl = getExplorerAddressUrl(destChainId, tx.to);
                    if (addressUrl) {
                        links.push({ label: `Destination on ${getExplorerName(destChainId)}`, url: addressUrl });
                    }
                }
                if (txHash && sourceChainId) {
                    const chainKeys: Record<number, string> = { 1: 'eth', 42161: 'arb', 8453: 'base', 10: 'opt' };
                    const chainKey = chainKeys[sourceChainId] ?? String(sourceChainId);
                    links.push({ label: 'Full trace on magn.ee', url: `https://magn.ee/explorer?tx=${txHash}&chain=${chainKey}` });
                }
                
                setExecutionStatus(prev => ({
                    ...prev,
                    status: 'done',
                    message: 'Transaction verified on-chain',
                    history: [...prev.history, 'Transaction verified on-chain'],
                    txLinks: links
                }));
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, []);

    const [originalChainId, setOriginalChainId] = useState<number | null>(null);

    const restoreOriginalChain = useCallback(async () => {
        if (originalChainId) {
            try {
                const { switchChain } = await import('@/lib/walletBridge');
                await switchChain(originalChainId);
                console.log('[Magnee] Restored original chain:', originalChainId);
            } catch (err) {
                console.warn('[Magnee] Failed to restore chain:', err);
            }
        }
    }, [originalChainId]);

    // Initialize SDK with bridge provider (window.ethereum doesn't exist in extension popups)
    useEffect(() => {
        const init = async () => {
            try {
                // Create EIP-1193 provider that proxies calls through walletBridge
                // (which uses chrome.scripting.executeScript to reach the active tab's wallet)
                const { walletRequest } = await import('@/lib/walletBridge');
                const bridgeProvider = {
                    request: async ({ method, params }: { method: string; params?: any[] }) => {
                        const result = await walletRequest(method, params);
                        if (!result.ok) throw new Error(result.error || 'Wallet request failed');
                        return result.result;
                    }
                };

                // Get original chain for restoration
                const chainIdHex = await bridgeProvider.request({ method: 'eth_chainId' });
                const chainId = parseInt(chainIdHex as string, 16);
                setOriginalChainId(chainId);
                console.log('[Magnee] Saved original chain:', chainId);

                // Initialize Li.Fi SDK with bridge provider
                initLiFiSDK(bridgeProvider);
            } catch (err) {
                console.warn('[Magnee] Failed to init SDK:', err);
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

    const handleDecision = async (action: 'MAGNEEFY' | 'CONTINUE' | 'REJECT', route?: Route) => {
        if (!reqId) return;
        const chosenRoute = action === 'MAGNEEFY' ? (route || selectedRoute) : undefined;

        if (action === 'REJECT') {
            chrome.runtime.sendMessage({
                type: 'MAGNEE_DECISION',
                payload: { id: reqId, action }
            });
            window.close();
            return;
        }

        if (action === 'MAGNEEFY' && chosenRoute) {
            // Delegation management from popup (via wallet bridge — invisible to dapp)
            // then send MAGNEEFY to dapp tab for wallet_sendCalls batched execution
            setStep('EXECUTING');
            const updateMsg = (msg: string) => {
                console.log('[Magnee]', msg);
                setExecutionStatus(prev => ({ 
                    ...prev, 
                    step: 1, 
                    total: 1, 
                    status: 'in_progress', 
                    message: msg,
                    history: [...prev.history, msg] 
                }));
            };

            try {
                updateMsg('Creating wallet bridge...');
                const { walletRequest, setCurrentReqId } = await import('@/lib/walletBridge');
                setCurrentReqId(reqId!);  // Route to the correct dapp tab
                
                updateMsg('Testing wallet connection...');
                const testResult = await walletRequest('eth_chainId');
                if (!testResult.ok) {
                    throw new Error(`Wallet bridge failed: ${testResult.error}`);
                }

                // === Delegation Management (via wallet bridge — invisible to dapp) ===
                const dappChainHex = testResult.result as string;
                const dappChainId = parseInt(dappChainHex, 16);
                const bridgeSourceChainId = chosenRoute.chainId;

                // Helper: get code via direct HTTP RPC (no chain switch needed)
                const RPC_URLS: Record<number, string> = {
                    1: 'https://eth.llamarpc.com',
                    8453: 'https://mainnet.base.org',
                    42161: 'https://arb1.arbitrum.io/rpc',
                    10: 'https://mainnet.optimism.io',
                };
                const getCode = async (addr: string, chainId: number): Promise<string> => {
                    const rpc = RPC_URLS[chainId];
                    if (!rpc) return '0x';
                    try {
                        const res = await fetch(rpc, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addr, 'latest'] })
                        });
                        const data = await res.json();
                        return data.result || '0x';
                    } catch { return '0x'; }
                };

                const { getDelegateAddress } = await import('@/lib/delegates');
                const fromAddr = tx?.from;
                if (!fromAddr) throw new Error('No from address');

                // 1. Source chain (bridge source): revoke if has delegation
                const sourceCode = await getCode(fromAddr, bridgeSourceChainId);
                if (sourceCode && sourceCode !== '0x') {
                    updateMsg('Revoking source chain delegation...');
                    const srcHex = `0x${bridgeSourceChainId.toString(16)}`;
                    await walletRequest('wallet_switchEthereumChain', [{ chainId: srcHex }]);
                    await walletRequest('eth_sendTransaction', [{
                        from: fromAddr,
                        to: fromAddr,
                        value: '0x0',
                        data: '0x',
                        type: '0x04',
                        authorizationList: [{ address: '0x0000000000000000000000000000000000000000', chainId: srcHex }]
                    }]);
                    console.log('[Magnee] Source delegation revoked ✅');
                }

                // 2. Destination chain (dapp chain): set our delegate if not present
                const destDelegate = getDelegateAddress(dappChainId);
                if (destDelegate) {
                    const destCode = await getCode(fromAddr, dappChainId);
                    const hasOurDelegate = destCode?.toLowerCase().includes(destDelegate.slice(2).toLowerCase());
                    if (!hasOurDelegate) {
                        updateMsg(`Setting destination delegation on chain ${dappChainId}...`);
                        const destHex = `0x${dappChainId.toString(16)}`;
                        await walletRequest('wallet_switchEthereumChain', [{ chainId: destHex }]);
                        await walletRequest('eth_sendTransaction', [{
                            from: fromAddr,
                            to: fromAddr,
                            value: '0x0',
                            data: '0x',
                            type: '0x04',
                            authorizationList: [{ address: destDelegate, chainId: destHex }]
                        }]);
                        console.log('[Magnee] Destination delegation set ✅');
                    }
                }

                // Switch wallet back to dapp chain before sending route to dapp tab
                const currentChainHex = (await walletRequest('eth_chainId')).result as string;
                const dappHex = `0x${dappChainId.toString(16)}`;
                if (currentChainHex !== dappHex) {
                    await walletRequest('wallet_switchEthereumChain', [{ chainId: dappHex }]);
                }

                updateMsg('Executing batched transaction...');
            } catch (err: any) {
                console.error('[Magnee] Delegation management failed:', err);
                // Non-fatal: proceed with execution even if delegation management fails
            }

            // Send MAGNEEFY to dapp tab — handleMagneefy → executeBatchedTx → wallet_sendCalls
            chrome.runtime.sendMessage({
                type: 'MAGNEE_DECISION',
                payload: { id: reqId, action: 'MAGNEEFY', route: chosenRoute }
            });
            setStep('STATUS');
            return;
        }

        // Fallback: send raw calldata to content script for execution
        chrome.runtime.sendMessage({
            type: 'MAGNEE_DECISION',
            payload: { id: reqId, action, route: chosenRoute }
        });
        setStep('STATUS');
    };

    const handleApprove = () => {
        if (!selectedRoute || !tx?.from || !reqId) return;
        triggerApproval(tx.from, selectedRoute, reqId);
    };

    const isTerminal = step === 'STATUS';

    if (loading) return <div className="flex h-full items-center justify-center bg-background text-muted-foreground">Loading...</div>;

    return (
        <div className="flex h-full w-full flex-col bg-background font-sans antialiased overflow-hidden">
            <Card className="flex h-full flex-col border-none shadow-none rounded-none bg-background">
                <CardHeader className="bg-card/80 backdrop-blur-sm pb-3 pt-5 border-b border-border shrink-0">
                    <Header />
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">

                    {(error || quotesError) && (
                        <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm">
                            <p className="font-medium text-destructive">Something went wrong</p>
                            <p className="text-muted-foreground mt-1 text-xs wrap-break-word">{error || quotesError}</p>
                            <Button variant="outline" size="sm" onClick={() => { setError(null); setStep('CONFIG'); }} className="mt-3">
                                Try Again
                            </Button>
                        </div>
                    )}

                    {!error && !quotesError && (
                        <>
                            <PaymentRequestHeader tx={tx} />

                            {step === 'CONFIG' && (
                                <QuoteConfigurator
                                    walletAddress={tx?.from || null}
                                    sourceChainId={sourceChainId}
                                    setSourceChainId={setSourceChainId}
                                    sourceTokenAddress={sourceTokenAddress}
                                    setSourceTokenAddress={setSourceTokenAddress}
                                    onFetchQuotes={handleFetchQuotes}
                                />
                            )}

                            {step === 'LOADING' && (
                                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                    <p className="text-sm text-muted-foreground">Searching for best routes...</p>
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

                            {step === 'EXECUTING' && (
                                <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
                                    <ExecutionProgress status={executionStatus} />
                                    <p className="text-sm text-muted-foreground">
                                        {executionStatus.status === 'pending'
                                            ? 'Please sign the transaction in your wallet.'
                                            : 'Processing...'}
                                    </p>
                                </div>
                            )}

                            {step === 'STATUS' && (
                                <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
                                    <ExecutionProgress status={executionStatus} />
                                </div>
                            )}
                        </>
                    )}

                </CardContent>

                <CardFooter className="flex-col gap-2 bg-card/80 backdrop-blur-sm border-t border-border p-4 shrink-0 z-10">
                    {isTerminal ? (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => { restoreOriginalChain(); window.close(); }}
                        >
                            Close
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                className="w-full text-muted-foreground h-8 text-xs"
                                onClick={() => handleDecision('CONTINUE')}
                            >
                                Skip & Pass Original
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full text-destructive/70 hover:text-destructive h-6 text-[10px]"
                                onClick={() => handleDecision('REJECT')}
                            >
                                Reject Transaction
                            </Button>
                        </>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}


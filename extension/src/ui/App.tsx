import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Info, AlertTriangle, ShieldCheck, ArrowRightLeft, Fuel, Search, ChevronRight } from 'lucide-react';
import { Route } from '@/injected/magneeUtils';
import { encodeFunctionData, encodeAbiParameters } from 'viem';
import { TxDiff } from './components/TxDiff';
import { fetchLiFiQuote, LiFiQuoteRequest } from '@/lib/lifi';
import { SUPPORTED_CHAINS, POPULAR_TOKENS, Chain, Token } from '@/lib/constants';
import './global.css';

type Step = 'CONFIG' | 'LOADING' | 'SELECT' | 'CONFIRM';

export default function App() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tx, setTx] = useState<{ to: string; value: string; data: string; chainId?: number; from?: string } | null>(null);
    const [reqId, setReqId] = useState<string | null>(null);

    // Quote Configuration
    const [step, setStep] = useState<Step>('CONFIG');
    const [sourceChainId, setSourceChainId] = useState<number>(31337);
    const [sourceTokenAddress, setSourceTokenAddress] = useState<string>('');

    // Results
    const [routes, setRoutes] = useState<Route[]>([]);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

    // Initialize
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
                setTx(response);
                // Initialize default source config
                // If detected chain (e.g. 31337) is not supported by Li.Fi selector, default to Optimism (10) for Pilot
                const detectedChainId = response.chainId || 31337;
                const isSupported = SUPPORTED_CHAINS.some(c => c.id === detectedChainId);
                const defaultChain = isSupported ? detectedChainId : 10; // Default to Optimism

                setSourceChainId(defaultChain);
                // Default to Native ETH
                setSourceTokenAddress('0x0000000000000000000000000000000000000000');
            }
            setLoading(false);
        });
    }, []);

    const fetchQuotes = async () => {
        if (!tx) return;
        setStep('LOADING');
        setRoutes([]);

        try {
            const currentChain = sourceChainId;
            const targetChain = tx.chainId || 31337;
            const generatedRoutes: Route[] = [];

            // PILOT HACK: If Target is Anvil (31337), force Target to Base (8453) to simulate a valid cross-chain quote.
            let effectiveTargetChain = targetChain;
            let effectiveTargetAddress = tx.to;

            if (targetChain === 31337) {
                console.warn('[Magnee] Target is Anvil (31337). Forcing Target to Base (8453) for Pilot Quote.');
                effectiveTargetChain = 8453;
                // ALSO switch the target address to the deployed Demo on Base
                // Address taken from demo/src/wagmi.ts
                effectiveTargetAddress = '0xf63fB71A13312344C5F27da32803338Da6a3DcEC';
            }

            console.log(`[Magnee] Fetching Li.Fi Quote from ${currentChain} -> ${effectiveTargetChain}`);

            // Convert Hex Value to Decimal String for Li.Fi API
            const amountDecimal = BigInt(tx.value).toString();

            const quote = await fetchLiFiQuote({
                fromChain: currentChain,
                fromToken: sourceTokenAddress,
                fromAddress: tx.from || '0x0000000000000000000000000000000000000000',
                toChain: effectiveTargetChain,
                toToken: '0x0000000000000000000000000000000000000000', // Assuming Target wants ETH
                toAmount: amountDecimal,
                integrator: 'magnee-extension',
                contractCalls: [{
                    fromAmount: amountDecimal,
                    fromTokenAddress: '0x0000000000000000000000000000000000000000',
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
                targetAddress: quote.transactionRequest.to, // CRITICAL: The Li.Fi Router Address
                targetData: tx.data,
                auxData: '0x',
                txValue: quote.transactionRequest.value // Pass the correct Native Value from Li.Fi
            });

            setRoutes(generatedRoutes);
            setStep('SELECT');

        } catch (err) {
            console.error(err);
            const debugInfo = ` [Params: Chain=${sourceChainId}, Token=${sourceTokenAddress}, From=${tx.from}]`;
            setError('Failed to fetch quotes: ' + (err as Error).message + debugInfo);
            setStep('CONFIG');
        }
    };

    const handleDecision = (action: 'MAGNEEFY' | 'CONTINUE' | 'REJECT', route?: Route) => {
        if (!reqId) return;
        const payloadRoute = action === 'MAGNEEFY' ? (route || selectedRoute) : undefined;
        chrome.runtime.sendMessage({
            type: 'MAGNEE_DECISION',
            payload: { id: reqId, action, route: payloadRoute }
        });
        window.close();
    };

    // Approval State
    const [needsApproval, setNeedsApproval] = useState(false);
    const [approving, setApproving] = useState(false);
    const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);

    // ERC20 Constants
    const ERC20_ABI = [
        {
            inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
            name: 'allowance',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function',
        },
        {
            inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function',
        }
    ] as const;

    // Helper to check allowance
    const checkAllowance = async (token: string, owner: string, spender: string, requiredAmount: bigint) => {
        // Skip for Native ETH
        if (token === '0x0000000000000000000000000000000000000000') return true;

        console.log(`[Magnee] Checking allowance for ${token} on owner ${owner} for spender ${spender}`);
        try {
            // We use a public RPC for read-only checks
            // For Pilot (Optimism), we can hardcode or use a configured RPC
            const rpcUrl = 'https://mainnet.optimism.io'; // Hardcoded for Pilot
            const body = {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                    {
                        to: token,
                        data: encodeFunctionData({
                            abi: ERC20_ABI,
                            functionName: 'allowance',
                            args: [owner as `0x${string}`, spender as `0x${string}`]
                        })
                    },
                    'latest'
                ]
            };

            const res = await fetch(rpcUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
            const json = await res.json();
            const allowanceHex = json.result;
            const allowanceIdx = BigInt(allowanceHex);

            console.log(`[Magnee] Allowance: ${allowanceIdx.toString()}, Required: ${requiredAmount.toString()}`);
            return allowanceIdx >= requiredAmount;

        } catch (e) {
            console.error('[Magnee] Failed to check allowance:', e);
            // Fail safe: assume approval needed if check fails? Or Assume true? 
            // Better to assume false -> force approval flow which might be redundant but safe
            return false;
        }
    };

    const handleApprove = () => {
        if (!selectedRoute || !tx?.from) return;
        setApproving(true);

        // Construct Approve Tx
        const spender = selectedRoute.targetAddress; // The Li.Fi Router
        if (!spender) {
            setError("Cannot approve: Missing spender address");
            setApproving(false);
            return;
        }

        const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender as `0x${string}`, BigInt(selectedRoute.amountIn)]
        });

        const approvalPayload = {
            from: tx.from,
            to: selectedRoute.tokenIn,
            data: data,
            value: '0x0'
        };

        // Send to ProviderWrapper to execute (BYPASSING INTERCEPTION)
        console.log('[Magnee UI] Sending MAGNEE_TRIGGER_TX...', approvalPayload);
        chrome.runtime.sendMessage({
            type: 'MAGNEE_TRIGGER_TX',
            payload: {
                tx: approvalPayload,
                chainId: selectedRoute.chainId, // Pass the required chain ID
                reqId // Link to current flow
            }
        }, (response) => {
            console.log('[Magnee UI] Approval Trigger Response:', response);

            if (chrome.runtime.lastError) {
                console.error('[Magnee UI] Runtime Error:', chrome.runtime.lastError);
                setError("Runtime Error: " + chrome.runtime.lastError.message);
                setApproving(false);
                return;
            }

            if (response && response.txHash) {
                console.log('[Magnee UI] Got TxHash immediately:', response.txHash);
                setApprovalTxHash(response.txHash);
                setTimeout(() => {
                    setNeedsApproval(false);
                    setApproving(false);
                }, 5000); // 5s wait assumption
            } else if (response && response.status === 'sent_to_page') {
                console.log('[Magnee UI] Approval forwarded to page. Waiting for user action...');
                // We don't have the hash yet, but we shouldn't error.
                // Ideally we show "Check your wallet"
                // For now, let's just NOT wait for hash here, but wait for user to click "Check Again" or just wait?
                // Let's assume the user will approve.
                // We can poll? Or just leave it as "Approving..." for a bit?
                // Let's set a timeout to reset 'Approving' state but NOT error.
                setTimeout(() => {
                    console.log('[Magnee UI] Assuming approval flow complete (timeout). User should re-check.');
                    setApproving(false);
                    // We don't set needsApproval(false) because we haven't verified it.
                    // The user will click "Approve" again if it failed, or we can add a "Re-check" button.
                    // But for this debug step, let's just stop the spinner.
                }, 10000);
            } else {
                console.warn('[Magnee UI] Unknown response:', response);
                setApproving(false);
                if (response?.error) setError("Approval failed: " + response.error);
                else setError("Failed to initiate approval (Unknown response)");
            }
        });
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (error) return (
        <div className="p-4 bg-red-50 text-red-600">
            <h3 className="font-bold">Error</h3>
            <p>{error}</p>
            <Button variant="outline" onClick={() => window.close()} className="mt-4">Close</Button>
        </div>
    );

    const formatEth = (val: string) => (Number(val) / 1e18).toFixed(4);

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

                    {/* Header: Payment Request */}
                    <div className="bg-white p-3 rounded-lg border shadow-sm">
                        <div className="text-xs font-semibold text-gray-500 uppercase">Payment Request</div>
                        <div className="flex justify-between items-center mt-2">
                            <div className="text-2xl font-bold">{tx ? formatEth(tx.value) : '0'} <span className="text-sm font-normal text-gray-500">ETH</span></div>
                            <div className="text-right">
                                <div className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                    To: {tx?.to.slice(0, 6)}...{tx?.to.slice(-4)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step: CONFIG */}
                    {step === 'CONFIG' && (
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-lg border shadow-sm space-y-4">
                                <h3 className="font-semibold text-sm">Pay With</h3>

                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Source Network</label>
                                    <select
                                        className="w-full text-sm border rounded p-2 bg-white"
                                        value={sourceChainId}
                                        onChange={(e) => {
                                            const newChainId = Number(e.target.value);
                                            setSourceChainId(newChainId);
                                            // Reset token to the first available for this chain (Native ETH defaults usually)
                                            const defaultToken = POPULAR_TOKENS.find(t => t.chainId === newChainId)?.address || '';
                                            setSourceTokenAddress(defaultToken);
                                        }}
                                    >
                                        {SUPPORTED_CHAINS.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500">Token</label>
                                    <select
                                        className="w-full text-sm border rounded p-2 bg-white"
                                        value={sourceTokenAddress}
                                        onChange={(e) => setSourceTokenAddress(e.target.value)}
                                    >
                                        {POPULAR_TOKENS.filter(t => t.chainId === sourceChainId).map(t => (
                                            <option key={t.address} value={t.address}>{t.symbol} - {t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <Button className="w-full" onClick={fetchQuotes}>
                                <Search className="w-4 h-4 mr-2" /> Find Routes
                            </Button>
                        </div>
                    )}

                    {/* Step: LOADING */}
                    {step === 'LOADING' && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            <p className="text-sm text-gray-500">Searching for best routes...</p>
                        </div>
                    )}

                    {/* Step: SELECT */}
                    {step === 'SELECT' && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase">Available Routes</h3>
                            {routes.map(r => (
                                <div
                                    key={r.id}
                                    className="bg-white p-3 rounded-lg border hover:border-indigo-300 cursor-pointer shadow-sm transition-all text-left"
                                    onClick={async () => {
                                        setSelectedRoute(r);
                                        setStep('CONFIRM');
                                        // Check Approval
                                        if (tx && tx.from && r.strategy === 'LIFI_BRIDGE') {
                                            const hasAllowance = await checkAllowance(r.tokenIn, tx.from, r.targetAddress || '', BigInt(r.amountIn));
                                            setNeedsApproval(!hasAllowance);
                                            console.log('[Magnee] Route Selection - Needs Approval?', !hasAllowance);
                                        }
                                    }}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="font-semibold text-sm">{r.title}</div>
                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        via {r.strategy === 'EXECUTE_ROUTE' ? 'Magnee Router' : 'Li.Fi Bridge'}
                                    </div>
                                </div>
                            ))}
                            <Button variant="ghost" className="w-full text-xs" onClick={() => setStep('CONFIG')}>
                                Back to Config
                            </Button>
                        </div>
                    )}

                    {/* Step: CONFIRM */}
                    {step === 'CONFIRM' && selectedRoute && (
                        <div className="space-y-4">
                            <TxDiff originalTx={tx!} selectedRoute={selectedRoute} />

                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" onClick={() => setStep('SELECT')}>Back</Button>
                                {needsApproval ? (
                                    <Button
                                        className="bg-amber-500 hover:bg-amber-600 text-white"
                                        onClick={handleApprove}
                                        disabled={approving}
                                    >
                                        {approving ? 'Approving...' : `Approve ${selectedRoute.tokenIn === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'USDC'}`}
                                    </Button>
                                ) : (
                                    <Button
                                        className="bg-purple-600 hover:bg-purple-700 text-white"
                                        onClick={() => handleDecision('MAGNEEFY')}
                                    >
                                        Confirm Magneefy
                                    </Button>
                                )}
                            </div>
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

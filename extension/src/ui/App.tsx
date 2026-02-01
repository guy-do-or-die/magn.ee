import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Info, AlertTriangle, ShieldCheck, ArrowRightLeft, Fuel } from 'lucide-react';
import { Route, MOCK_USDC_ADDRESS } from '@/injected/magneeUtils';
import { encodeFunctionData, encodeAbiParameters } from 'viem';
import './global.css';

// Mock Hook for Routes
const useRoutes = (tx: any | null) => {
    const [routes, setRoutes] = useState<Route[]>([]);

    useEffect(() => {
        if (!tx) return;

        // Mock Logic: Always offer a "Swap to USDC" route if ETH value > 0
        const ethValue = tx.value ? Number(tx.value) / 1e18 : 0;

        const generatedRoutes: Route[] = [];

        // 1. Direct Execution (Default) - "Pay with Native ETH"
        // This isn't really a "Magneefied" route in the sense of rewrites, 
        // but we can represent it or just handle it as "Pass".
        // Magneefy usually implies "Do something smart".

        // 2. Magneefy: Swap to USDC (Mock)
        // Contract ID: 0xCf7... (Router)
        // Token Out: 0x5FC... (USDC)
        if (ethValue > 0) {
            // New Router ABI for executeRoute
            const executeRouteAbi = [{
                type: 'function',
                name: 'executeRoute',
                inputs: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'target', type: 'address' },
                    { name: 'targetData', type: 'bytes' },
                    { name: 'auxData', type: 'bytes' }
                ],
                outputs: [],
                stateMutability: 'payable'
            }] as const;

            // Route 1: Pay with ETH (Forward)
            // Strategy: Router receives ETH, calls Target with ETH.
            const forwardData = encodeFunctionData({
                abi: executeRouteAbi,
                functionName: 'executeRoute',
                args: [
                    '0x0000000000000000000000000000000000000000', // tokenIn (ETH)
                    BigInt(tx.value), // amountIn
                    tx.to as `0x${string}`, // target
                    tx.data as `0x${string}` || '0x', // targetData
                    '0x' // auxData (None)
                ]
            });

            generatedRoutes.push({
                id: 'route-eth-forward',
                title: 'Pay with ETH (Forwarded)',
                tokenIn: '0x0000000000000000000000000000000000000000',
                amountIn: tx.value,
                tokenOut: tx.to,
                chainId: 31337,
                strategy: 'EXECUTE_ROUTE',
                calldata: forwardData,
                targetAddress: tx.to,
                targetData: tx.data
            });

            // Route 2: Pay with USDC (Simulated)
            // Strategy: Router receives ETH (mocking USDC value), Calls Target with ETH.
            // But also Mints USDC to sender to simulate "Swap".
            // auxData contains TokenOut address for the mock mint.
            const usdcAuxData = encodeAbiParameters(
                [{ type: 'address' }],
                [MOCK_USDC_ADDRESS as `0x${string}`]
            );

            const usdcRouteData = encodeFunctionData({
                abi: executeRouteAbi,
                functionName: 'executeRoute',
                args: [
                    '0x0000000000000000000000000000000000000000', // tokenIn (ETH)
                    BigInt(tx.value), // amountIn
                    tx.to as `0x${string}`, // target
                    tx.data as `0x${string}` || '0x', // targetData
                    usdcAuxData // auxData (USDC Address for mock mint)
                ]
            });

            generatedRoutes.push({
                id: 'route-usdc-mock',
                title: 'Pay with USDC (Simulated)',
                tokenIn: '0x0000000000000000000000000000000000000000', // Used ETH for mock input
                amountIn: tx.value,
                tokenOut: MOCK_USDC_ADDRESS,
                chainId: 31337,
                strategy: 'EXECUTE_ROUTE',
                calldata: usdcRouteData,
                targetAddress: tx.to,
                targetData: tx.data,
                auxData: usdcAuxData
            });
        }

        setRoutes(generatedRoutes);
    }, [tx]);

    return routes;
};

export default function App() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tx, setTx] = useState<{ to: string; value: string } | null>(null);
    const [reqId, setReqId] = useState<string | null>(null);

    // Route Selection State
    const routes = useRoutes(tx);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

    useEffect(() => {
        // Auto-select first magnee route if available
        if (routes.length > 0 && !selectedRoute) {
            setSelectedRoute(routes[0]);
        }
    }, [routes]);

    useEffect(() => {
        // 1. Get ID from URL
        const queryParams = new URLSearchParams(window.location.search);
        const id = queryParams.get('id');

        if (!id) {
            setError('No Request ID provided');
            setLoading(false);
            return;
        }

        setReqId(id);

        // 2. Fetch Tx Details from Background
        chrome.runtime.sendMessage({ type: 'GET_TX_DETAILS', id }, (response) => {
            if (!response || response.error) {
                setError(response?.error || 'Failed to fetch transaction details');
            } else {
                setTx(response);
            }
            setLoading(false);
        });
    }, []);

    const handleDecision = (action: 'MAGNEEFY' | 'CONTINUE' | 'REJECT', route?: Route) => {
        if (!reqId) return;

        // If Magneefy, require a route
        const payloadRoute = action === 'MAGNEEFY' ? (route || selectedRoute) : undefined;

        chrome.runtime.sendMessage({
            type: 'MAGNEE_DECISION',
            payload: { id: reqId, action, route: payloadRoute }
        });

        window.close();
    };

    if (loading) {
        return (
            <div className="flex bg-gray-50 h-[600px] w-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    <p className="text-sm text-gray-500">Loading request...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex bg-red-50 h-[600px] w-[400px] items-center justify-center p-4">
                <Card className="w-full max-w-sm border-red-200 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" /> Error
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-700">{error}</p>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => window.close()}>Close</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    const valueEth = tx?.value ? (Number(tx.value) / 1e18).toFixed(4) : '0';

    return (
        <div className="flex h-full w-full flex-col bg-gray-50 font-sans antialiased overflow-hidden">
            <Card className="flex h-full flex-col border-none shadow-none rounded-none">
                <CardHeader className="bg-white pb-3 pt-5 text-center border-b shrink-0">
                    <CardTitle className="text-lg">Signature Request</CardTitle>
                    <CardDescription className="text-xs">Verify transaction details</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto bg-gray-50/50 p-4 space-y-4">

                    {/* Amount Display */}
                    <div className="flex flex-col items-center justify-center space-y-1 py-2">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                            {valueEth} <span className="text-base font-medium text-gray-500">ETH</span>
                        </h1>
                        <p className="text-[10px] text-gray-400">≈ $--.-- USD</p>
                    </div>

                    {/* Details Box */}
                    <div className="rounded-lg bg-white p-3 space-y-3 border shadow-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-500">To</span>
                            <div className="flex items-center gap-2 font-mono text-xs max-w-[200px]">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 truncate w-full text-right" title={tx?.to}>
                                    {tx?.to || 'Unknown'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Routes Section */}
                    {routes.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Proposed Routes</h3>
                            {routes.map(r => (
                                <div
                                    key={r.id}
                                    className={`relative cursor-pointer rounded-lg border p-3 transition-all ${selectedRoute?.id === r.id ? 'bg-purple-50 border-purple-300 shadow-sm' : 'bg-white hover:border-purple-200'}`}
                                    onClick={() => setSelectedRoute(r)}
                                >
                                    {selectedRoute?.id === r.id && (
                                        <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-purple-500"></div>
                                    )}
                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                                            <ArrowRightLeft className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{r.title}</p>
                                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                                <Fuel className="h-3 w-3" /> Gas Optimized
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                </CardContent>

                <CardFooter className="flex-col gap-2.5 bg-white border-t p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                    <Button
                        className="w-full bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold h-10 text-base shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                        onClick={() => handleDecision('MAGNEEFY')}
                        disabled={!selectedRoute}
                    >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span className="ml-1">
                            {selectedRoute ? `Execute: ${selectedRoute.title}` : 'Select a Route'}
                        </span>
                    </Button>

                    <Button
                        variant="outline"
                        className="w-full border-gray-200 text-gray-600 hover:bg-gray-50 h-9 text-sm"
                        onClick={() => handleDecision('CONTINUE')}
                    >
                        Pass (Original)
                    </Button>

                    <Button
                        variant="ghost"
                        className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 h-7 text-[10px]"
                        onClick={() => handleDecision('REJECT')}
                    >
                        Reject
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

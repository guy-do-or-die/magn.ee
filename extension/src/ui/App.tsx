import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Info, AlertTriangle, ShieldCheck } from 'lucide-react';
import './global.css';

export default function App() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tx, setTx] = useState<{ to: string; value: string } | null>(null);
    const [reqId, setReqId] = useState<string | null>(null);

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

    const handleDecision = (action: 'MAGNEEFY' | 'CONTINUE' | 'REJECT') => {
        if (!reqId) return;

        chrome.runtime.sendMessage({
            type: 'MAGNEE_DECISION',
            payload: { id: reqId, action }
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
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-500">Network</span>
                            <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                                Anvil (Local)
                            </span>
                        </div>
                    </div>

                    {/* Info/Warning */}
                    <div className="rounded-md bg-blue-50 p-3 text-[11px] leading-tight text-blue-700 flex gap-2 items-start border border-blue-100">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <p>
                            Magnee can route this transaction through alternate paths to optimize fees.
                        </p>
                    </div>

                </CardContent>

                <CardFooter className="flex-col gap-2.5 bg-white border-t p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                    <Button
                        className="w-full bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold h-10 text-base shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
                        onClick={() => handleDecision('MAGNEEFY')}
                    >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span className="ml-1">Magneefy</span>
                    </Button>

                    <Button
                        variant="outline"
                        className="w-full border-gray-200 text-gray-600 hover:bg-gray-50 h-9 text-sm"
                        onClick={() => handleDecision('CONTINUE')}
                    >
                        Pass
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

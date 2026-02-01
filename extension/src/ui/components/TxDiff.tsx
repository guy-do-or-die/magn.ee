import { ArrowRight, ArrowRightLeft, ShieldCheck, Wallet } from 'lucide-react';
import { Route } from '@/injected/magneeUtils';
import { Card, CardContent } from '@/components/ui/card';

interface TxDiffProps {
    originalTx: { to: string; value: string };
    selectedRoute: Route | null;
}

export function TxDiff({ originalTx, selectedRoute }: TxDiffProps) {
    if (!selectedRoute) {
        return (
            <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center text-sm text-gray-500">
                Select a route to view transaction details
            </div>
        );
    }

    // Use hardcoded decimals for now or pass in Route metadata
    const decimals = selectedRoute.tokenIn.toLowerCase() === '0x0000000000000000000000000000000000000000' ? 18 : 6; // USDC is 6
    const payAmount = (Number(selectedRoute.amountIn) / Math.pow(10, decimals)).toFixed(6);
    const receiveAmount = (Number(originalTx.value) / 1e18).toFixed(4); // Assuming 18 decimals for ETH

    // Determine Token symbols (Mock)
    const payToken = selectedRoute.tokenIn === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'USDC';
    const receiveToken = 'ETH'; // Target usually wants Native

    return (
        <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardContent className="p-0">
                {/* Header: Strategy Type */}
                <div className="bg-purple-50 px-4 py-2 border-b border-purple-100 flex items-center gap-2 text-xs font-medium text-purple-700">
                    <ShieldCheck className="w-3 h-3" />
                    {selectedRoute.title}
                </div>

                <div className="p-4 flex items-center justify-between gap-2">
                    {/* Left: You Pay */}
                    <div className="flex-1 flex flex-col items-start min-w-0">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">You Pay</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-lg font-bold text-gray-900">{payAmount}</span>
                            <span className="text-xs font-medium text-gray-600">{payToken}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 truncate max-w-full">
                            <Wallet className="w-3 h-3" />
                            <span className="truncate">Your Wallet</span>
                        </div>
                    </div>

                    {/* Middle: Arrow */}
                    <div className="flex flex-col items-center justify-center px-2 text-gray-300">
                        <ArrowRight className="w-5 h-5 text-purple-400" />
                    </div>

                    {/* Right: Merchant Receives */}
                    <div className="flex-1 flex flex-col items-end min-w-0 text-right">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Merchant Gets</span>
                        <div className="flex items-baseline gap-1 mt-1 justify-end">
                            <span className="text-lg font-bold text-gray-900">{receiveAmount}</span>
                            <span className="text-xs font-medium text-gray-600">{receiveToken}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 truncate max-w-full justify-end w-full">
                            <span className="truncate max-w-[80px]" title={originalTx.to}>
                                {originalTx.to.slice(0, 6)}...{originalTx.to.slice(-4)}
                            </span>
                            <ArrowRightLeft className="w-3 h-3 rotate-90" />
                        </div>
                    </div>
                </div>

                {/* Footer: Fee/Gas Estimate (Mock) */}
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-500">
                    <span>Network Cost</span>
                    <span className="font-mono">~$0.05</span>
                </div>
            </CardContent>
        </Card>
    );
}

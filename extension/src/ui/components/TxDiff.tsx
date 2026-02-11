import { ArrowRight, ArrowRightLeft, ShieldCheck, Wallet } from 'lucide-react';
import { Route } from '@/injected/magneeUtils';
import { Card, CardContent } from '@magnee/ui/components/card';

interface TxDiffProps {
    originalTx: {
        to: string;
        value: string;
        detectedAction?: {
            type: string;
            description: string;
            tokenAddress?: string;
            tokenAmount?: string;
        };
    };
    selectedRoute: Route | null;
}

export function TxDiff({ originalTx, selectedRoute }: TxDiffProps) {
    if (!selectedRoute) {
        return (
            <div className="p-4 bg-secondary rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                Select a route to view transaction details
            </div>
        );
    }

    const action = originalTx.detectedAction;
    const isDefi = !!action && action.type !== 'Payment Request';

    const decimals = selectedRoute.tokenIn.toLowerCase() === '0x0000000000000000000000000000000000000000' ? 18 : 6;
    const payAmount = (Number(selectedRoute.amountIn) / Math.pow(10, decimals)).toFixed(6);
    const payToken = selectedRoute.tokenIn === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'USDC';

    // Right-side display: use detected action for DeFi, raw value for payments
    const receiveLabel = isDefi ? action!.type : 'Merchant Gets';
    const receiveDescription = isDefi ? action!.description : null;
    const receiveAmount = isDefi ? null : (Number(originalTx.value) / 1e18).toFixed(4);
    const receiveToken = isDefi ? null : 'ETH';

    return (
        <Card className="glass-card gradient-border overflow-hidden border-none">
            <CardContent className="p-0">
                {/* Header: Strategy Type */}
                <div className="bg-primary/10 px-4 py-2 border-b border-primary/20 flex items-center gap-2 text-xs font-medium text-primary">
                    <ShieldCheck className="w-3 h-3" />
                    {selectedRoute.title}
                </div>

                <div className="p-4 flex items-center justify-between gap-2">
                    {/* Left: You Pay */}
                    <div className="flex-1 flex flex-col items-start min-w-0">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">You Pay</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-lg font-bold">{payAmount}</span>
                            <span className="text-xs font-medium text-muted-foreground">{payToken}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground truncate max-w-full">
                            <Wallet className="w-3 h-3" />
                            <span className="truncate">Your Wallet</span>
                        </div>
                    </div>

                    {/* Middle: Arrow */}
                    <div className="flex flex-col items-center justify-center px-2">
                        <ArrowRight className="w-5 h-5 text-primary" />
                    </div>

                    {/* Right: Protocol/Merchant Receives */}
                    <div className="flex-1 flex flex-col items-end min-w-0 text-right">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{receiveLabel}</span>
                        {receiveDescription ? (
                            <div className="mt-1">
                                <span className="text-sm font-bold">{receiveDescription}</span>
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-1 mt-1 justify-end">
                                <span className="text-lg font-bold">{receiveAmount}</span>
                                <span className="text-xs font-medium text-muted-foreground">{receiveToken}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground truncate max-w-full justify-end w-full">
                            <span className="truncate max-w-[80px]" title={originalTx.to}>
                                {originalTx.to.slice(0, 6)}...{originalTx.to.slice(-4)}
                            </span>
                            <ArrowRightLeft className="w-3 h-3 rotate-90" />
                        </div>
                    </div>
                </div>

                {/* Footer: Fee/Gas Estimate */}
                <div className="px-4 py-2 bg-secondary/50 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
                    <span>Network Cost</span>
                    <span className="font-mono">~$0.05</span>
                </div>
            </CardContent>
        </Card>
    );
}


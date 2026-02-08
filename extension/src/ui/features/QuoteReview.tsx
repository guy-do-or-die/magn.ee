import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@magnee/ui/components/button';
import TxButton from '../components/TxButton';
import { Route } from '@/injected/magneeUtils';
import { TxDiff } from '../components/TxDiff';
import { ZERO_ADDRESS } from '@/lib/constants';

interface QuoteReviewProps {
    tx: any;
    selectedRoute: Route;
    needsApproval: boolean;
    approving: boolean;
    onApprove: () => void;
    onConfirm: () => void;
    onBack: () => void;
}

export function QuoteReview({
    tx,
    selectedRoute,
    needsApproval,
    approving,
    onApprove,
    onConfirm,
    onBack
}: QuoteReviewProps) {
    const [safetyOverride, setSafetyOverride] = useState(false);
    const isOverLimit = !!(selectedRoute.amountUSD && parseFloat(selectedRoute.amountUSD) > 5);

    return (
        <div className="space-y-4">
            <TxDiff originalTx={tx} selectedRoute={selectedRoute} />

            {(!needsApproval && isOverLimit) && (
                <div className="p-3 badge-error border rounded-xl text-xs">
                    <strong className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Pilot Safety Limit</strong>
                    <p className="mt-1">
                        Amount (${parseFloat(selectedRoute.amountUSD!).toFixed(2)}) exceeds the recommended $5.00 pilot limit.
                    </p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input
                            type="checkbox"
                            id="safety-override"
                            className="rounded border-destructive/50 text-destructive focus:ring-destructive"
                            checked={safetyOverride}
                            onChange={(e) => setSafetyOverride(e.target.checked)}
                        />
                        <span className="font-medium">I understand the risks</span>
                    </label>
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onBack}>Back</Button>
                {needsApproval ? (
                    <TxButton
                        className="bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={async () => onApprove()}
                        text={`Approve ${selectedRoute.tokenIn === ZERO_ADDRESS ? 'ETH' : 'USDC'}`}
                        loadingText="Approving..."
                        disabled={approving}
                    />
                ) : (
                    <TxButton
                        id="confirm-btn"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={async () => onConfirm()}
                        text="Confirm Magneefy"
                        loadingText="Confirming..."
                        disabled={isOverLimit && !safetyOverride}
                    />
                )}
            </div>
        </div>
    );
}

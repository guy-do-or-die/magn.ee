import { formatEther } from 'viem';
import { AddressChip } from '@magnee/ui/components/address-chip';

interface PaymentRequestHeaderProps {
    tx: {
        to: string;
        value: string;
        detectedAction?: {
            type: string;
            description: string;
            tokenAddress: string;
            tokenAmount: bigint | string;
        };
    } | null;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function PaymentRequestHeader({ tx }: PaymentRequestHeaderProps) {
    const action = tx?.detectedAction;
    const isNative = !action || action.tokenAddress === ZERO_ADDRESS;
    const formatEth = (val: string | undefined) => Number(formatEther(BigInt(val || '0'))).toFixed(4);

    // Action type badge label
    const actionLabel = action?.type ?? 'Payment Request';

    return (
        <div className="glass-card rounded-xl p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{actionLabel}</div>
            <div className="mt-2 space-y-2">
                {/* Amount / description */}
                <div className={`font-bold ${isNative ? 'text-2xl' : 'text-sm'}`}>
                    {isNative ? (
                        <>{tx ? formatEth(tx.value) : '0'} <span className="text-sm font-normal text-muted-foreground">ETH</span></>
                    ) : (
                        <span className="text-foreground">{action?.description}</span>
                    )}
                </div>
                {/* Target address */}
                {tx?.to && (
                    <div className="flex items-center gap-2">
                        <AddressChip address={tx.to} label="To" chars={6} copyable />
                    </div>
                )}
            </div>
        </div>
    );
}

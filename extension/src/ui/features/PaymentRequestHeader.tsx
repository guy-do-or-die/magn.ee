import { formatEther } from 'viem';

interface PaymentRequestHeaderProps {
    tx: {
        to: string;
        value: string;
    } | null;
}

export function PaymentRequestHeader({ tx }: PaymentRequestHeaderProps) {
    const formatEth = (val: string) => Number(formatEther(BigInt(val))).toFixed(4);

    return (
        <div className="glass-card rounded-xl p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Payment Request</div>
            <div className="flex justify-between items-center mt-2">
                <div className="text-2xl font-bold">
                    {tx ? formatEth(tx.value) : '0'} <span className="text-sm font-normal text-muted-foreground">ETH</span>
                </div>
                <div className="text-right">
                    <div className="text-xs bg-secondary text-muted-foreground px-2 py-1 rounded-md">
                        To: {tx?.to.slice(0, 6)}...{tx?.to.slice(-4)}
                    </div>
                </div>
            </div>
        </div>
    );
}

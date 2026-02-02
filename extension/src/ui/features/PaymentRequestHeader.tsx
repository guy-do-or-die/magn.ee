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
        <div className="bg-white p-3 rounded-lg border shadow-sm">
            <div className="text-xs font-semibold text-gray-500 uppercase">Payment Request</div>
            <div className="flex justify-between items-center mt-2">
                <div className="text-2xl font-bold">
                    {tx ? formatEth(tx.value) : '0'} <span className="text-sm font-normal text-gray-500">ETH</span>
                </div>
                <div className="text-right">
                    <div className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        To: {tx?.to.slice(0, 6)}...{tx?.to.slice(-4)}
                    </div>
                </div>
            </div>
        </div>
    );
}

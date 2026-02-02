import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { SUPPORTED_CHAINS, POPULAR_TOKENS } from '@/lib/constants';

interface QuoteConfiguratorProps {
    sourceChainId: number;
    setSourceChainId: (id: number) => void;
    sourceTokenAddress: string;
    setSourceTokenAddress: (address: string) => void;
    onFetchQuotes: () => void;
}

export function QuoteConfigurator({
    sourceChainId,
    setSourceChainId,
    sourceTokenAddress,
    setSourceTokenAddress,
    onFetchQuotes
}: QuoteConfiguratorProps) {
    return (
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

            <Button className="w-full" onClick={onFetchQuotes}>
                <Search className="w-4 h-4 mr-2" /> Find Routes
            </Button>
        </div>
    );
}

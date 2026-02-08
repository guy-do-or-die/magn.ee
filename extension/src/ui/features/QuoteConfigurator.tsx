import { Button } from '@magnee/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@magnee/ui/components/select';
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
            <div className="glass-card rounded-2xl p-4 space-y-4">
                <h3 className="font-semibold text-sm">Pay With</h3>

                <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Source Network</label>
                    <Select
                        value={sourceChainId.toString()}
                        onValueChange={(val) => {
                            const newChainId = Number(val);
                            setSourceChainId(newChainId);
                            const defaultToken = POPULAR_TOKENS.find(t => t.chainId === newChainId)?.address || '';
                            setSourceTokenAddress(defaultToken);
                        }}
                    >
                        <SelectTrigger className="bg-secondary">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent portal={false}>
                            {SUPPORTED_CHAINS.map(c => (
                                <SelectItem key={c.id} value={c.id.toString()}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Token</label>
                    <Select
                        value={sourceTokenAddress}
                        onValueChange={(val) => setSourceTokenAddress(val)}
                    >
                        <SelectTrigger className="bg-secondary">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent portal={false}>
                            {POPULAR_TOKENS.filter(t => t.chainId === sourceChainId).map(t => (
                                <SelectItem key={t.address} value={t.address}>
                                    {t.symbol} — {t.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Button className="w-full" onClick={onFetchQuotes}>
                <Search className="w-4 h-4 mr-2" /> Find Routes
            </Button>
        </div>
    );
}

import { Button } from '@magnee/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@magnee/ui/components/select';
import { Search, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getTokensWithBalances, type TokenWithBalance } from '@/lib/tokenBalances';
import { SUPPORTED_CHAINS } from '@/lib/constants';
import { loadSettings, type UserSettings } from '@/lib/settings';

interface QuoteConfiguratorProps {
    walletAddress: string | null;
    sourceChainId: number;
    setSourceChainId: (id: number) => void;
    sourceTokenAddress: string;
    setSourceTokenAddress: (address: string) => void;
    onFetchQuotes: () => void;
    txValueUSD?: string; // Optional: value of intercepted transaction
}

export function QuoteConfigurator({
    walletAddress,
    sourceChainId,
    setSourceChainId,
    sourceTokenAddress,
    setSourceTokenAddress,
    onFetchQuotes,
    txValueUSD
}: QuoteConfiguratorProps) {
    const [tokens, setTokens] = useState<TokenWithBalance[]>([]);
    const [loading, setLoading] = useState(false);
    const [availableChains, setAvailableChains] = useState<number[]>([]);
    const [preferredTokens, setPreferredTokens] = useState<Record<number, string>>({});

    // Fetch tokens with balances when wallet address or chain changes
    useEffect(() => {
        if (!walletAddress) {
            setTokens([]);
            setAvailableChains([]);
            return;
        }

        const fetchTokens = async () => {
            setLoading(true);
            try {
                // Load user settings for preferred tokens
                const settings = await loadSettings();
                setPreferredTokens(settings.preferredTokens || {});

                // Get all supported chain IDs
                const chainIds = SUPPORTED_CHAINS.map(c => c.id);
                
                // Fetch tokens with balances
                const tokensWithBalances = await getTokensWithBalances(walletAddress, chainIds);
                setTokens(tokensWithBalances);

                // Determine which chains have tokens
                const chainsWithTokens = [...new Set(tokensWithBalances.map(t => t.chainId))];
                setAvailableChains(chainsWithTokens);

                // If current chain has no tokens, switch to first available
                if (chainsWithTokens.length > 0 && !chainsWithTokens.includes(sourceChainId)) {
                    setSourceChainId(chainsWithTokens[0]);
                }

                // Auto-select preferred token on chain, or first available
                const tokensOnChain = tokensWithBalances.filter(t => t.chainId === sourceChainId);
                const preferred = settings.preferredTokens?.[sourceChainId];
                const preferredMatch = preferred && tokensOnChain.find(t => t.address.toLowerCase() === preferred.toLowerCase());
                if (preferredMatch) {
                    setSourceTokenAddress(preferredMatch.address);
                } else if (tokensOnChain.length > 0 && !tokensOnChain.some(t => t.address === sourceTokenAddress)) {
                    setSourceTokenAddress(tokensOnChain[0].address);
                }
            } catch (error) {
                console.error('[QuoteConfigurator] Error fetching tokens:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTokens();
    }, [walletAddress]);

    // Get tokens for selected chain
    const tokensOnSelectedChain = tokens.filter(t => t.chainId === sourceChainId);

    // Check if a token has sufficient balance
    const hasSufficientBalance = (token: TokenWithBalance) => {
        if (!txValueUSD || !token.balanceUSD) return false;
        return parseFloat(token.balanceUSD) >= parseFloat(txValueUSD);
    };

    return (
        <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4 space-y-4">
                <h3 className="font-semibold text-sm">Pay With</h3>

                {!walletAddress ? (
                    <div className="text-center text-sm text-muted-foreground py-4">
                        Connect wallet to select payment tokens
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading tokens with balances...
                    </div>
                ) : tokens.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-4">
                        No tokens with balance found
                    </div>
                ) : (
                    <>
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Source Network</label>
                            <Select
                                value={sourceChainId.toString()}
                                onValueChange={(val) => {
                                    const newChainId = Number(val);
                                    setSourceChainId(newChainId);
                                    
                                    // Auto-select preferred token on new chain, or first available
                                    const tokensOnChain = tokens.filter(t => t.chainId === newChainId);
                                    const preferred = preferredTokens[newChainId];
                                    const preferredMatch = preferred && tokensOnChain.find(t => t.address.toLowerCase() === preferred.toLowerCase());
                                    if (preferredMatch) {
                                        setSourceTokenAddress(preferredMatch.address);
                                    } else if (tokensOnChain.length > 0) {
                                        setSourceTokenAddress(tokensOnChain[0].address);
                                    }
                                }}
                            >
                                <SelectTrigger className="bg-secondary">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent portal={false}>
                                    {SUPPORTED_CHAINS
                                        .filter(c => availableChains.includes(c.id))
                                        .map(c => {
                                            const tokenCount = tokens.filter(t => t.chainId === c.id).length;
                                            return (
                                                <SelectItem key={c.id} value={c.id.toString()}>
                                                    {c.name} ({tokenCount} {tokenCount === 1 ? 'token' : 'tokens'})
                                                </SelectItem>
                                            );
                                        })}
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
                                    {tokensOnSelectedChain.map(t => {
                                        const isSufficient = hasSufficientBalance(t);
                                        return (
                                            <SelectItem key={t.address} value={t.address}>
                                                <div className="flex flex-col gap-0.5 py-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{t.symbol}</span>
                                                        <span className="text-xs text-muted-foreground">— {t.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-muted-foreground">
                                                            {t.formattedBalance} {t.symbol} (${t.balanceUSD})
                                                        </span>
                                                        {isSufficient && (
                                                            <span className="text-green-500">✓ Sufficient</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                )}
            </div>

            <Button 
                className="w-full" 
                onClick={onFetchQuotes}
                disabled={!walletAddress || tokens.length === 0 || loading}
            >
                <Search className="w-4 h-4 mr-2" /> Find Routes
            </Button>
        </div>
    );
}

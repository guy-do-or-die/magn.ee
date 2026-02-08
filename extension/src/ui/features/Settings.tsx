import { useState, useEffect, useCallback } from 'react';
import delegateAddresses from '@/lib/delegates.json';
import { Button } from '@magnee/ui/components/button';
import { Switch } from '@magnee/ui/components/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@magnee/ui/components/accordion';
import { cn } from '@magnee/ui/lib/utils';
import { Header } from '../components/Header';
import { getAccounts, walletRequest, switchChain } from '@/lib/walletBridge';
import { Link2, Settings as SettingsIcon } from 'lucide-react';

// Chain configuration with RPC URLs for on-chain checks
const SUPPORTED_CHAINS = [
    { id: 10, name: 'Optimism', rpc: 'https://mainnet.optimism.io' },
    { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org' },
    { id: 42161, name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc' },
];

type DelegationState = 'unknown' | 'pending' | 'delegated' | 'delegated_other' | 'not_delegated';

interface ChainDelegation {
    state: DelegationState;
    delegatedTo?: string;
}

interface DelegationStatus {
    [chainId: number]: ChainDelegation;
}

export function Settings() {
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [delegationStatus, setDelegationStatus] = useState<DelegationStatus>({});
    const [pendingChain, setPendingChain] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Interception toggle
    const [interceptionEnabled, setInterceptionEnabled] = useState(true);

    // Load interception setting
    useEffect(() => {
        chrome.storage.local.get(['interceptionEnabled'], (result) => {
            setInterceptionEnabled(result.interceptionEnabled !== false);
        });
    }, []);

    const handleInterceptionToggle = useCallback((checked: boolean) => {
        setInterceptionEnabled(checked);
        chrome.storage.local.set({ interceptionEnabled: checked });
    }, []);

    /**
     * Check if address has 7702 delegation on a specific chain via direct RPC
     */
    const checkChainDelegation = useCallback(async (
        address: string,
        chainId: number,
        rpc: string
    ): Promise<ChainDelegation> => {
        const expectedDelegate = (delegateAddresses as Record<string, string>)[chainId.toString()];

        try {
            const response = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getCode',
                    params: [address, 'latest']
                })
            });

            const data = await response.json();
            const code = data.result;

            // 7702 delegation: 0xef0100 + 20-byte address = 48 hex chars
            if (!code || code === '0x' || code.length < 48) {
                return { state: 'not_delegated' };
            }

            // Extract delegated address from 0xef0100<addr>
            const delegatedTo = '0x' + code.slice(8).toLowerCase();

            if (expectedDelegate && delegatedTo === expectedDelegate.toLowerCase()) {
                return { state: 'delegated' };
            } else {
                return { state: 'delegated_other', delegatedTo };
            }
        } catch (err) {
            console.error(`eth_getCode failed for chain ${chainId}:`, err);
            return { state: 'unknown' };
        }
    }, []);

    /**
     * Check all chains — works even without wallet connection (uses hardcoded address or relay)
     */
    const checkAllChains = useCallback(async (address: string) => {
        const newStatus: DelegationStatus = {};

        await Promise.all(SUPPORTED_CHAINS.map(async (chain) => {
            try {
                newStatus[chain.id] = await checkChainDelegation(address, chain.id, chain.rpc);
            } catch {
                newStatus[chain.id] = { state: 'unknown' };
            }
        }));

        setDelegationStatus(newStatus);
    }, [checkChainDelegation]);

    useEffect(() => {
        async function init() {
            setLoading(true);
            try {
                // Try to get address from the dapp tab's wallet
                const result = await getAccounts();
                if (result.ok && result.result?.length) {
                    const addr = result.result[0];
                    setWalletAddress(addr);
                    await checkAllChains(addr);
                }
            } catch (err) {
                console.warn('[Magnee Settings] Could not reach wallet:', err);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, [checkAllChains]);

    /**
     * Send a 7702 authorization tx via eth_sendTransaction with type 0x04.
     * Works with Trust Wallet and other wallets that support EIP-7702 natively.
     */
    async function send7702Auth(chainId: number, contractAddress: string): Promise<string> {
        const hexChainId = `0x${chainId.toString(16)}`;

        const result = await walletRequest('eth_sendTransaction', [{
            type: '0x04',
            from: walletAddress,
            to: walletAddress,
            value: '0x0',
            data: '0x',
            authorizationList: [{
                address: contractAddress,
                chainId: hexChainId,
            }]
        }]);

        if (!result.ok) {
            throw new Error(result.error || 'Delegation transaction failed');
        }

        return result.result || '';
    }

    /**
     * Set up 7702 delegation on a chain
     */
    async function delegateOnChain(chainId: number) {
        if (!walletAddress) return;

        const delegateAddress = (delegateAddresses as Record<string, string>)[chainId.toString()];
        if (!delegateAddress) {
            setError(`No delegate contract deployed on chain ${chainId}`);
            return;
        }

        setPendingChain(chainId);
        setDelegationStatus(prev => ({ ...prev, [chainId]: { state: 'pending' } }));
        setError(null);

        try {
            const switchResult = await switchChain(chainId);
            if (!switchResult.ok) throw new Error(switchResult.error || 'Failed to switch chain');

            const txHash = await send7702Auth(chainId, delegateAddress);
            console.log('[Magnee] Delegation tx:', txHash);

            // Re-check after a delay
            setTimeout(() => {
                if (walletAddress) {
                    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
                    if (chain) {
                        checkChainDelegation(walletAddress, chainId, chain.rpc)
                            .then(d => setDelegationStatus(prev => ({ ...prev, [chainId]: d })));
                    }
                }
            }, 5000);
        } catch (err: any) {
            console.error('[Magnee] Delegation failed:', err);
            const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
            if (chain && walletAddress) {
                checkChainDelegation(walletAddress, chainId, chain.rpc)
                    .then(d => setDelegationStatus(prev => ({ ...prev, [chainId]: d })));
            }
            setError(err.message || 'Delegation failed');
        } finally {
            setPendingChain(null);
        }
    }

    /**
     * Revoke 7702 delegation on a chain
     */
    async function revokeOnChain(chainId: number) {
        if (!walletAddress) return;

        setPendingChain(chainId);
        setDelegationStatus(prev => ({ ...prev, [chainId]: { state: 'pending' } }));
        setError(null);

        try {
            const switchResult = await switchChain(chainId);
            if (!switchResult.ok) throw new Error(switchResult.error || 'Failed to switch chain');

            // Revoke = delegate to zero address
            const txHash = await send7702Auth(chainId, '0x0000000000000000000000000000000000000000');
            console.log('[Magnee] Revoke tx:', txHash);

            setTimeout(() => {
                if (walletAddress) {
                    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
                    if (chain) {
                        checkChainDelegation(walletAddress, chainId, chain.rpc)
                            .then(d => setDelegationStatus(prev => ({ ...prev, [chainId]: d })));
                    }
                }
            }, 5000);
        } catch (err: any) {
            console.error('[Magnee] Revocation failed:', err);
            const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
            if (chain && walletAddress) {
                checkChainDelegation(walletAddress, chainId, chain.rpc)
                    .then(d => setDelegationStatus(prev => ({ ...prev, [chainId]: d })));
            }
            setError(err.message || 'Revocation failed');
        } finally {
            setPendingChain(null);
        }
    }

    function getStatusBadge(chainId: number) {
        const d = delegationStatus[chainId] || { state: 'unknown' };
        const styles: Record<DelegationState, string> = {
            delegated: 'badge-success',
            delegated_other: 'badge-warning',
            pending: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
            not_delegated: 'bg-secondary text-muted-foreground border-border',
            unknown: 'bg-secondary text-muted-foreground border-border',
        };
        const labels: Record<DelegationState, string> = {
            delegated: 'Active',
            delegated_other: 'Other',
            pending: 'Pending',
            not_delegated: '—',
            unknown: '...',
        };
        return (
            <span className={cn('text-xs px-2 py-0.5 rounded-md border font-mono', styles[d.state])}>
                {labels[d.state]}
            </span>
        );
    }

    const isActive = !!walletAddress;

    return (
        <div className="w-full p-5 bg-background text-foreground">
            <Header />

            {/* Intercept Toggle - Centered */}
            <div className="flex items-center justify-center gap-2.5 mb-6">
                <Switch 
                    checked={interceptionEnabled} 
                    onCheckedChange={handleInterceptionToggle}
                    className={cn(
                        "data-[state=checked]:bg-primary",
                        !interceptionEnabled && "data-[state=unchecked]:bg-destructive"
                    )}
                />
                <span className="text-foreground/80 font-medium">Intercept</span>
            </div>

            {/* Error */}
            {error && (
                <div className="badge-error rounded-xl p-3 mb-4 text-sm border">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="text-center text-muted-foreground text-sm py-6">Checking wallet...</p>
            ) : !isActive ? (
                <section className="text-center py-6">
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        Open a web3 app with a connected wallet,<br />
                        then reopen this popup.
                    </p>
                </section>
            ) : (
                <>
                    {/* Address */}
                    <section className="glass-card rounded-xl p-3 mb-5">
                        <code className="text-primary text-sm">
                            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                        </code>
                    </section>

                    {/* Accordion Sections */}
                    <div className="mt-2">
                    <Accordion type="single" collapsible defaultValue="security" className="w-full">
                        {/* Security Section */}
                        <AccordionItem value="security">
                            <AccordionTrigger className="text-sm font-semibold">
                                <span className="flex items-center gap-2">
                                    <Link2 className="h-4 w-4 text-primary" />
                                    Security & Delegation
                                </span>
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-xs text-muted-foreground mb-3">
                                    Delegate your EOA on target chains to enable cross-chain payments
                                    with preserved <code className="bg-secondary px-1 py-0.5 rounded text-primary text-[10px]">msg.sender</code>.
                                </p>

                                <div className="flex flex-col gap-2">
                                    {SUPPORTED_CHAINS.map(chain => {
                                        const d = delegationStatus[chain.id] || { state: 'unknown' };
                                        const isDelegated = d.state === 'delegated';
                                        const isDelegatedOther = d.state === 'delegated_other';
                                        const canRevoke = isDelegated || isDelegatedOther;
                                        const isPending = pendingChain === chain.id;

                                        return (
                                            <div key={chain.id} className="glass-card rounded-xl p-3">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-primary pulse-dot" />
                                                        <span className="font-medium text-sm">{chain.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {getStatusBadge(chain.id)}
                                                        {canRevoke ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => revokeOnChain(chain.id)}
                                                                disabled={isPending}
                                                                className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-7"
                                                            >
                                                                {isPending ? '⏳...' : 'Revoke'}
                                                            </Button>
                                                        ) : d.state === 'not_delegated' ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => delegateOnChain(chain.id)}
                                                                disabled={isPending}
                                                                className="text-primary border-primary/30 hover:bg-primary/10 text-xs h-7"
                                                            >
                                                                {isPending ? '⏳...' : 'Delegate'}
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                {isDelegatedOther && d.delegatedTo && (
                                                    <p className="text-xs text-amber-400/70 mt-1.5 font-mono truncate">
                                                        → {d.delegatedTo}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        {/* Settings Section */}
                        <AccordionItem value="settings">
                            <AccordionTrigger className="text-sm font-semibold">
                                <span className="flex items-center gap-2">
                                    <SettingsIcon className="h-4 w-4 text-primary" />
                                    Settings
                                </span>
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-xs text-muted-foreground italic">
                                    Coming soon: ENS text.records preferences
                                </p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    </div>
                </>
            )}
        </div>
    );
}

import { useState, useEffect, useCallback } from 'react';
import delegateAddresses from '@/lib/delegates.json';
import { Button } from '@magnee/ui/components/button';
import { Switch } from '@magnee/ui/components/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@magnee/ui/components/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@magnee/ui/components/select';
import { cn } from '@magnee/ui/lib/utils';
import { Header } from '../components/Header';
import { getAccounts, walletRequest, switchChain } from '@/lib/walletBridge';
import { Link2, Settings as SettingsIcon, Download, Upload, Tag, Loader2 } from 'lucide-react';
import { loadSettings, saveSettings, UserSettings, DEFAULT_SETTINGS, getENSName } from '@/lib/settings';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { getTokens } from '@lifi/sdk';
import type { Token } from '@lifi/sdk';

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
    
    // User settings state
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [ensName, setEnsName] = useState<string | null>(null);
    const [loadingFromENS, setLoadingFromENS] = useState(false);
    const [savingToENS, setSavingToENS] = useState(false);
    const [chainTokens, setChainTokens] = useState<Record<number, Token[]>>({});

    // Fetch available tokens per chain for the preferred token selectors
    useEffect(() => {
        async function fetchChainTokens() {
            try {
                const chainIds = SUPPORTED_CHAINS.map(c => c.id);
                const result = await getTokens({ chains: chainIds });
                const tokensByChain: Record<number, Token[]> = {};
                for (const chainId of chainIds) {
                    const tokens = result.tokens[chainId] || [];
                    // Sort by price (popular tokens first), take top 30
                    tokensByChain[chainId] = tokens
                        .sort((a, b) => parseFloat(b.priceUSD || '0') - parseFloat(a.priceUSD || '0'))
                        .slice(0, 30);
                }
                setChainTokens(tokensByChain);
            } catch (err) {
                console.warn('[Magnee Settings] Failed to fetch chain tokens:', err);
            }
        }
        fetchChainTokens();
    }, []);

    // Interception toggle (keep existing implementation)
    const [interceptionEnabled, setInterceptionEnabled] = useState(true);

    // Load interception setting
    useEffect(() => {
        chrome.storage.local.get(['interceptionEnabled'], (result: { interceptionEnabled: boolean; }) => {
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
     * Check all chains
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
                // Try to get address from the dapp tab's wallet first
                const result = await getAccounts();
                let addr: string | undefined;
                
                if (result.ok && result.result?.length) {
                    addr = result.result[0];
                    setWalletAddress(addr);
                    await checkAllChains(addr);
                }
                
                // Create viem client for ENS resolution (mainnet)
                const publicClient = createPublicClient({
                    chain: mainnet,
                    transport: http(),
                });
                
                // Load settings (with ENS check if address available)
                const loadedSettings = await loadSettings(addr, publicClient);
                setSettings(loadedSettings);
                
                // Check for ENS name if address available
                if (addr) {
                    const name = await getENSName(addr, publicClient);
                    setEnsName(name);
                }
            } catch (err) {
                console.warn('[Magnee Settings] Could not reach wallet:', err);
                // Fallback load without ENS
                const loadedSettings = await loadSettings();
                setSettings(loadedSettings);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, [checkAllChains]);
    
    /**
     * Auto-save settings to chrome.storage when they change
     */
    useEffect(() => {
        if (!loading) {
            saveSettings(settings).catch(err => {
                console.error('[Magnee Settings] Failed to save:', err);
            });
        }
    }, [settings, loading]);

    /**
     * Load settings from ENS text records
     */
    const handleLoadFromENS = async () => {
        if (!walletAddress) return;
        
        setLoadingFromENS(true);
        setError(null);
        try {
            const publicClient = createPublicClient({
                chain: mainnet,
                transport: http(),
            });
            
            const { syncFromENS } = await import('@/lib/settings');
            const ensSettings = await syncFromENS(walletAddress, publicClient);
            
            if (ensSettings) {
                setSettings(ensSettings);
            } else {
                setError('No settings found in ENS text records');
            }
        } catch (err: any) {
            console.error('[Magnee] Failed to load from ENS:', err);
            setError(err.message || 'Failed to load from ENS');
        } finally {
            setLoadingFromENS(false);
        }
    };

    /**
     * Save settings to ENS text records via walletRequest relay
     */
    const handleSaveToENS = async () => {
        if (!ensName || !walletAddress) return;
        
        setSavingToENS(true);
        setError(null);
        try {
            const { encodeFunctionData, namehash } = await import('viem');
            const { normalize } = await import('viem/ens');
            const { RESOLVER_ABI } = await import('@/lib/settings/ens');
            const { minifySettings } = await import('@/lib/settings/types');
            
            const normalizedName = normalize(ensName);
            
            // Resolve the ENS resolver address
            const publicClient = createPublicClient({
                chain: mainnet,
                transport: http(),
            });
            const resolver = await publicClient.getEnsResolver({
                name: normalizedName,
            });
            if (!resolver) throw new Error('No resolver found for ENS name');
            
            // Encode setText(node, key, value) calldata
            const node = namehash(normalizedName);
            const settingsJson = minifySettings(settings);
            const data = encodeFunctionData({
                abi: RESOLVER_ABI,
                functionName: 'setText',
                args: [node, 'com.magnee.settings', settingsJson],
            });
            
            // Switch to mainnet first
            const switchResult = await switchChain(1);
            if (!switchResult.ok) throw new Error(switchResult.error || 'Failed to switch to mainnet');
            
            // Send tx via walletRequest relay (wallet shows gas cost)
            const txResult = await walletRequest('eth_sendTransaction', [{
                from: walletAddress,
                to: resolver,
                data,
                value: '0x0',
            }]);
            
            if (!txResult.ok) throw new Error(txResult.error || 'Transaction rejected');
            console.log('[Magnee] ENS settings saved, tx:', txResult.result);
        } catch (err: any) {
            console.error('[Magnee] Failed to save to ENS:', err);
            setError(err.message || 'Failed to save to ENS');
        } finally {
            setSavingToENS(false);
        }
    };

    /**
     * Send a 7702 authorization tx via eth_sendTransaction with type 0x04
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
        setDelegationStatus((prev: any) => ({ ...prev, [chainId]: { state: 'pending' } }));
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
                            .then((d: any) => setDelegationStatus((prev: any) => ({ ...prev, [chainId]: d })));
                    }
                }
            }, 5000);
        } catch (err: any) {
            console.error('[Magnee] Delegation failed:', err);
            const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
            if (chain && walletAddress) {
                checkChainDelegation(walletAddress, chainId, chain.rpc)
                    .then((d: any) => setDelegationStatus((prev: any) => ({ ...prev, [chainId]: d })));
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
        setDelegationStatus((prev: any) => ({ ...prev, [chainId]: { state: 'pending' } }));
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
                            .then((d: any) => setDelegationStatus((prev: any) => ({ ...prev, [chainId]: d })));
                    }
                }
            }, 5000);
        } catch (err: any) {
            console.error('[Magnee] Revocation failed:', err);
            const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
            if (chain && walletAddress) {
                checkChainDelegation(walletAddress, chainId, chain.rpc)
                    .then((d: any) => setDelegationStatus((prev: any) => ({ ...prev, [chainId]: d })));
            }
            setError(err.message || 'Revocation failed');
        } finally {
            setPendingChain(null);
        }
    }

    function getStatusBadge(chainId: number) {
        const d: ChainDelegation = delegationStatus[chainId] || { state: 'unknown' as DelegationState };
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
                        {ensName && (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {ensName}
                            </div>
                        )}
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
                                                                {isPending ? (
                                                                    <>
                                                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                                        Revoking
                                                                    </>
                                                                ) : 'Revoke'}
                                                            </Button>
                                                        ) : d.state === 'not_delegated' ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => delegateOnChain(chain.id)}
                                                                disabled={isPending}
                                                                className="text-primary border-primary/30 hover:bg-primary/10 text-xs h-7"
                                                            >
                                                                {isPending ? (
                                                                    <>
                                                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                                        Delegating
                                                                    </>
                                                                ) : 'Delegate'}
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
                            <AccordionContent className="px-1">
                                <p className="text-xs text-muted-foreground mb-3">
                                    Manage your preferences. {ensName && 'Sync settings to/from ENS text records.'}
                                </p>

                                {/* Theme Toggle */}
                                <div className="flex justify-between items-center py-2">
                                    <div>
                                        <div className="font-medium text-sm">Theme</div>
                                        <div className="text-xs text-muted-foreground">Dark or light mode</div>
                                    </div>
                                    <Switch
                                        checked={settings.theme === 'dark'}
                                        onCheckedChange={(checked: any) => setSettings({ ...settings, theme: checked ? 'dark' : 'light' })}
                                    />
                                </div>
                                
                                <div className="h-px bg-border/50 my-1" />

                                {/* Slippage */}
                                <div className="flex justify-between items-center py-2">
                                    <div className="flex-1">
                                        <div className="font-medium text-sm">Slippage</div>
                                        <div className="text-xs text-muted-foreground">
                                            {(settings.slippage / 100).toFixed(2)}%
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="1"
                                            max="5000"
                                            step="1"
                                            value={settings.slippage}
                                            onChange={(e: { target: { value: string; }; }) => setSettings({ ...settings, slippage: parseInt(e.target.value) || 50 })}
                                            className="w-16 bg-secondary text-foreground text-xs rounded px-2 py-1 text-right border border-border/50"
                                        />
                                        <span className="text-xs text-muted-foreground">bps</span>
                                    </div>
                                </div>

                                <div className="h-px bg-border/50 my-1" />

                                {/* Gas Limit Multiplier */}
                                <div className="flex justify-between items-center py-2">
                                    <div className="flex-1">
                                        <div className="font-medium text-sm">Gas Limit</div>
                                        <div className="text-xs text-muted-foreground">
                                            Multiplier ({settings.gasLimit ? `${(settings.gasLimit * 100).toFixed(0)}%` : 'auto'})
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="1"
                                            max="3"
                                            step="0.1"
                                            value={settings.gasLimit ?? ''}
                                            placeholder="auto"
                                            onChange={(e: { target: { value: string; }; }) => {
                                                const val = parseFloat(e.target.value);
                                                setSettings({ ...settings, gasLimit: isNaN(val) ? undefined : val });
                                            }}
                                            className="w-16 bg-secondary text-foreground text-xs rounded px-2 py-1 text-right border border-border/50"
                                        />
                                        <span className="text-xs text-muted-foreground">×</span>
                                    </div>
                                </div>

                                <div className="h-px bg-border/50 my-1" />

                                {/* Preferred Tokens per Chain */}
                                <div className="py-2">
                                    <div className="font-medium text-sm mb-1">Preferred Tokens</div>
                                    <div className="text-xs text-muted-foreground mb-2">
                                        Default receive token per chain
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {SUPPORTED_CHAINS.map(chain => {
                                            const tokens = chainTokens[chain.id] || [];
                                            const currentValue = settings.preferredTokens[chain.id] || '';
                                            return (
                                                <div key={chain.id} className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground w-16 shrink-0">{chain.name}</span>
                                                    <Select
                                                        value={currentValue}
                                                        onValueChange={(val) => setSettings({
                                                            ...settings,
                                                            preferredTokens: {
                                                                ...settings.preferredTokens,
                                                                [chain.id]: val === '__none__' ? '' : val,
                                                            },
                                                        })}
                                                    >
                                                        <SelectTrigger className="flex-1 bg-secondary text-xs h-7">
                                                            <SelectValue placeholder="Auto" />
                                                        </SelectTrigger>
                                                        <SelectContent portal={false}>
                                                            <SelectItem value="__none__">
                                                                <span className="text-muted-foreground">Auto (highest balance)</span>
                                                            </SelectItem>
                                                            {tokens.slice(0, 20).map(t => (
                                                                <SelectItem key={t.address} value={t.address}>
                                                                    {t.symbol} — {t.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                {/* ENS Sync Buttons */}
                                {ensName && (
                                    <>
                                        <div className="h-px bg-border/50 my-2" />
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleLoadFromENS}
                                                disabled={loadingFromENS}
                                                className="flex-1 text-xs"
                                            >
                                                <Download className="h-3 w-3 mr-1.5" />
                                                {loadingFromENS ? 'Loading...' : 'Load from ENS'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleSaveToENS}
                                                disabled={savingToENS}
                                                className="flex-1 text-xs"
                                            >
                                                <Upload className="h-3 w-3 mr-1.5" />
                                                {savingToENS ? 'Saving...' : 'Save to ENS'}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    </div>
                </>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import delegateAddresses from '@/lib/delegates.json';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { requestAccounts, getAccounts, walletRequest, switchChain } from '@/lib/walletBridge';

// Chain configuration with RPC URLs for on-chain checks
const SUPPORTED_CHAINS = [
    { id: 10, name: 'Optimism', color: 'bg-red-500', rpc: 'https://mainnet.optimism.io' },
    { id: 8453, name: 'Base', color: 'bg-blue-500', rpc: 'https://mainnet.base.org' },
    { id: 42161, name: 'Arbitrum', color: 'bg-cyan-500', rpc: 'https://arb1.arbitrum.io/rpc' },
];

type DelegationState = 'unknown' | 'pending' | 'delegated' | 'not_delegated';

interface DelegationStatus {
    [chainId: number]: DelegationState;
}

export function Settings() {
    const [walletConnected, setWalletConnected] = useState(false);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [delegationStatus, setDelegationStatus] = useState<DelegationStatus>({});
    const [pendingChain, setPendingChain] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        checkWalletConnection();
    }, []);

    async function checkWalletConnection() {
        try {
            const result = await getAccounts();
            if (result.ok && result.result && result.result.length > 0) {
                setWalletAddress(result.result[0]);
                setWalletConnected(true);
                // Check on-chain delegation status for all chains
                checkAllChainsDelegation(result.result[0]);
                setError(null);
            }
        } catch (err) {
            console.error('Failed to check wallet:', err);
        }
    }

    async function connectWallet() {
        try {
            setError(null);
            const result = await requestAccounts();
            
            if (result.ok && result.result && result.result.length > 0) {
                setWalletAddress(result.result[0]);
                setWalletConnected(true);
                checkAllChainsDelegation(result.result[0]);
            } else if (!result.ok) {
                setError(result.error || 'Failed to connect wallet');
            }
        } catch (err: any) {
            console.error('Failed to connect wallet:', err);
            setError(err.message || 'Failed to connect wallet');
        }
    }

    /**
     * Check delegation status on all supported chains
     * Uses eth_getCode to detect if EOA has delegated code (7702)
     */
    async function checkAllChainsDelegation(address: string) {
        const newStatus: DelegationStatus = {};
        
        await Promise.all(SUPPORTED_CHAINS.map(async (chain) => {
            try {
                const state = await checkChainDelegation(address, chain.id, chain.rpc);
                newStatus[chain.id] = state;
            } catch (err) {
                console.error(`Failed to check delegation on ${chain.name}:`, err);
                newStatus[chain.id] = 'unknown';
            }
        }));
        
        setDelegationStatus(newStatus);
    }

    /**
     * Check if address has 7702 delegation to our contract on a specific chain
     */
    async function checkChainDelegation(
        address: string, 
        chainId: number, 
        rpc: string
    ): Promise<DelegationState> {
        const expectedDelegate = (delegateAddresses as Record<string, string>)[chainId.toString()];
        if (!expectedDelegate) return 'unknown';

        try {
            // Call eth_getCode to check if EOA has delegated code
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
            
            // 7702 delegation sets code to: 0xef0100 + delegateAddress (20 bytes)
            // Total: 0xef0100 (3 bytes) + address (20 bytes) = 23 bytes = 46 hex chars + '0x' = 48 chars
            if (!code || code === '0x' || code.length < 48) {
                return 'not_delegated';
            }
            
            // Check if delegated to our contract
            // Format: 0xef0100<20-byte-address>
            const delegatedTo = '0x' + code.slice(8).toLowerCase(); // Skip 0xef0100
            const expectedLower = expectedDelegate.toLowerCase();
            
            if (delegatedTo === expectedLower) {
                return 'delegated';
            } else {
                // Delegated to someone else (like Ambire)
                console.log(`Delegated to different contract: ${delegatedTo}`);
                return 'not_delegated';
            }
        } catch (err) {
            console.error('eth_getCode failed:', err);
            return 'unknown';
        }
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
        setDelegationStatus(prev => ({ ...prev, [chainId]: 'pending' }));
        setError(null);

        try {
            // Switch to target chain
            const switchResult = await switchChain(chainId);
            if (!switchResult.ok) {
                throw new Error(switchResult.error || 'Failed to switch chain');
            }

            // Send EIP-7702 transaction
            const result = await walletRequest('eth_sendTransaction', [{
                type: '0x04',
                from: walletAddress,
                to: walletAddress,
                value: '0x0',
                data: '0x',
                authorizationList: [{
                    address: delegateAddress,
                    chainId: `0x${chainId.toString(16)}`
                }]
            }]);

            if (!result.ok) {
                throw new Error(result.error || 'Delegation failed');
            }

            console.log('Delegation tx hash:', result.result);
            
            // Re-check on-chain status after a short delay
            setTimeout(() => {
                if (walletAddress) {
                    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
                    if (chain) {
                        checkChainDelegation(walletAddress, chainId, chain.rpc)
                            .then(state => setDelegationStatus(prev => ({ ...prev, [chainId]: state })));
                    }
                }
            }, 3000);

        } catch (err: any) {
            console.error('Delegation failed:', err);
            setDelegationStatus(prev => ({ ...prev, [chainId]: 'not_delegated' }));
            
            if (err.message?.includes('not supported') || err.message?.includes('unknown type')) {
                setError('Your wallet does not support EIP-7702. Try MetaMask or a 7702-compatible wallet.');
            } else if (err.message?.includes('rejected') || err.message?.includes('denied')) {
                setError('Transaction rejected by user.');
            } else {
                setError(err.message || 'Delegation failed');
            }
        } finally {
            setPendingChain(null);
        }
    }

    /**
     * Revoke 7702 delegation (set to zero address)
     */
    async function revokeOnChain(chainId: number) {
        if (!walletAddress) return;

        setPendingChain(chainId);
        setDelegationStatus(prev => ({ ...prev, [chainId]: 'pending' }));
        setError(null);

        try {
            // Switch to target chain
            const switchResult = await switchChain(chainId);
            if (!switchResult.ok) {
                throw new Error(switchResult.error || 'Failed to switch chain');
            }

            // Send 7702 tx with zero address to revoke
            const result = await walletRequest('eth_sendTransaction', [{
                type: '0x04',
                from: walletAddress,
                to: walletAddress,
                value: '0x0',
                data: '0x',
                authorizationList: [{
                    address: '0x0000000000000000000000000000000000000000',
                    chainId: `0x${chainId.toString(16)}`
                }]
            }]);

            if (!result.ok) {
                throw new Error(result.error || 'Revocation failed');
            }

            console.log('Revocation tx hash:', result.result);
            
            // Re-check on-chain status
            setTimeout(() => {
                if (walletAddress) {
                    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
                    if (chain) {
                        checkChainDelegation(walletAddress, chainId, chain.rpc)
                            .then(state => setDelegationStatus(prev => ({ ...prev, [chainId]: state })));
                    }
                }
            }, 3000);

        } catch (err: any) {
            console.error('Revocation failed:', err);
            if (err.message?.includes('rejected') || err.message?.includes('denied')) {
                setError('Transaction rejected by user.');
            } else {
                setError(err.message || 'Revocation failed');
            }
            // Re-check actual status
            const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
            if (chain && walletAddress) {
                checkChainDelegation(walletAddress, chainId, chain.rpc)
                    .then(state => setDelegationStatus(prev => ({ ...prev, [chainId]: state })));
            }
        } finally {
            setPendingChain(null);
        }
    }

    function getStatusBadge(chainId: number) {
        const status = delegationStatus[chainId] || 'unknown';
        const styles = {
            delegated: 'bg-green-500/20 text-green-400',
            pending: 'bg-yellow-500/20 text-yellow-400',
            not_delegated: 'bg-red-500/20 text-red-400',
            unknown: 'bg-gray-500/20 text-gray-400',
        };
        const labels = {
            delegated: '✓ Delegated',
            pending: '⏳ Pending...',
            not_delegated: '✗ Not Delegated',
            unknown: '? Checking...',
        };
        return (
            <span className={cn('text-xs px-2 py-1 rounded', styles[status])}>
                {labels[status]}
            </span>
        );
    }

    return (
        <div className="w-full min-w-[320px] max-w-[400px] min-h-fit p-5 bg-linear-to-br from-slate-900 to-slate-800 text-white">
            {/* Header */}
            <header className="text-center mb-6">
                <h1 className="text-2xl font-bold bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                    ⚡ Magnee
                </h1>
                <p className="text-sm text-slate-400 mt-1">Cross-Chain Payment Interceptor</p>
            </header>

            {/* Error Display */}
            {error && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
                    {error}
                </div>
            )}

            {!walletConnected ? (
                <section className="text-center py-10">
                    <p className="text-slate-300 mb-4">Connect your wallet to manage delegation settings.</p>
                    <Button 
                        onClick={connectWallet}
                        className="bg-linear-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500"
                    >
                        Connect Wallet
                    </Button>
                </section>
            ) : (
                <>
                    {/* Wallet Info */}
                    <section className="bg-white/5 rounded-lg p-3 mb-5">
                        <code className="text-cyan-400 text-sm">
                            {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                        </code>
                    </section>

                    {/* Delegation Section */}
                    <section className="mb-5">
                        <h2 className="text-base font-semibold mb-2">🔗 Chain Delegation</h2>
                        <p className="text-xs text-slate-400 mb-4">
                            Delegate your EOA on target chains to enable cross-chain payments 
                            with preserved <code className="bg-white/10 px-1.5 py-0.5 rounded text-cyan-400">msg.sender</code>.
                        </p>

                        <div className="flex flex-col gap-2.5">
                            {SUPPORTED_CHAINS.map(chain => {
                                const status = delegationStatus[chain.id] || 'unknown';
                                const isDelegated = status === 'delegated';
                                const isPending = pendingChain === chain.id;
                                
                                return (
                                    <div key={chain.id} className="flex justify-between items-center bg-white/5 rounded-lg p-3">
                                        <div className="flex items-center gap-2">
                                            <span className={cn('w-2.5 h-2.5 rounded-full', chain.color)} />
                                            <span className="font-medium">{chain.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(chain.id)}
                                            {isDelegated ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => revokeOnChain(chain.id)}
                                                    disabled={isPending}
                                                    className="text-red-400 border-red-400/30 hover:bg-red-400/20"
                                                >
                                                    {isPending ? 'Revoking...' : 'Revoke'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => delegateOnChain(chain.id)}
                                                    disabled={isPending}
                                                    className="text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/20"
                                                >
                                                    {isPending ? 'Delegating...' : 'Delegate'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

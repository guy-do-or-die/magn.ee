/**
 * Magnee Provider Wrapper
 * 
 * Intercepts window.ethereum and wraps the request method to detect
 * payable transactions and show the Magnee popup.
 * 
 * SOLID: Single responsibility - just wraps provider, delegates to handlers
 */

import { handlePayableTransaction, handleDirectExecution } from './handlers/txHandler';
import { getCurrentChainId, type RequestFn } from './handlers/chainUtils';

console.log('[Magnee] Provider wrapper injecting...');

// ============================================================================
// Types
// ============================================================================

interface EthereumProvider {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    _magneeWrapped?: boolean;
    [key: string]: any;
}

declare global {
    interface Window {
        ethereum?: EthereumProvider;
    }
}

// ============================================================================
// Provider Wrapping
// ============================================================================

function wrapProvider(provider: EthereumProvider): EthereumProvider {
    if (!provider || provider._magneeWrapped) return provider;

    console.log('[Magnee] Wrapping provider:', provider);

    const originalRequest: RequestFn = provider.request.bind(provider);

    // Store original request for debugging (bypass wrapper)
    const originals = (window as any).__magneeOriginalProviders || [];
    originals.push({ request: originalRequest, provider });
    (window as any).__magneeOriginalProviders = originals;

    // Processing lock: prevents re-interception while Magnee handles a tx
    // (MetaMask's wallet_sendCalls fallback calls this.request() internally)
    let processing = false;

    // Override request method — only intercept eth_sendTransaction
    provider.request = async function (args: { method: string; params?: any[] }) {
        // Fast path: everything except eth_sendTransaction goes straight through
        if (args.method !== 'eth_sendTransaction') {
            // Block dapp chain switches while Magnee is processing
            // (prevents Aave etc. from reverting Magnee's chain switches)
            // Wallet bridge sets __magneeFromBridge=true to bypass this
            if (processing && args.method === 'wallet_switchEthereumChain' 
                && !(window as any).__magneeFromBridge) {
                console.log('[Magnee] Suppressing dapp chain switch during processing');
                return null;
            }
            const result = await originalRequest(args);
            // Track which provider has accounts → mark as active for Settings relay
            if ((args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') 
                && Array.isArray(result) && result.length > 0) {
                (window as any).__magneeActiveProvider = provider;
            }
            return result;
        }

        // === eth_sendTransaction interception ===
        const tx = args.params?.[0];
        console.log('[Magnee] Intercepted eth_sendTransaction:', tx);

        // Already processing a Magnee tx → pass through (batch/fallback call)
        if (processing) {
            console.log('[Magnee] Already processing — passing through');
            return originalRequest(args);
        }

        // Pass through EIP-7702 delegation/revocation transactions
        if (tx?.type === '0x04') {
            console.log('[Magnee] 7702 tx — passing through');
            return originalRequest(args);
        }

        try {
            if (tx && tx.value && BigInt(tx.value) > 0n) {
                processing = true;
                const chainId = await getCurrentChainId(originalRequest);
                return await handlePayableTransaction(tx, chainId, args, originalRequest);
            } else {
                console.log('[Magnee] Tx skipped: No value or value is 0', tx?.value);
            }
        } catch (err: any) {
            // User rejected via Magnee popup → propagate to dapp (don't send original tx)
            if (err?.message?.includes('User rejected')) {
                console.log('[Magnee] User rejected — suppressing original tx');
                throw err;
            }
            // Unexpected error → fall through to send original tx
            console.error('[Magnee] Interception logic failed, forwarding original:', err);
        } finally {
            processing = false;
        }

        return originalRequest(args);
    };

    // Install direct execution listener (once globally)
    installDirectExecutionListener(originalRequest);

    provider._magneeWrapped = true;

    // Store wrapped providers globally so the Settings relay can find them
    if (!(window as any).__magneeProviders) (window as any).__magneeProviders = [];
    if (!(window as any).__magneeProviders.includes(provider)) {
        (window as any).__magneeProviders.push(provider);
    }

    return provider;
}

// ============================================================================
// Direct Execution Listener
// ============================================================================

function installDirectExecutionListener(originalRequest: RequestFn): void {
    if ((window as any).MAGNEE_LISTENER_INSTALLED) return;
    (window as any).MAGNEE_LISTENER_INSTALLED = true;
    
    console.log('[Magnee] Attaching global execution listener');

    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'MAGNEE_EXECUTE_TX') return;

        const { tx, chainId } = event.data.payload;
        
        try {
            await handleDirectExecution(tx, chainId, originalRequest);
        } catch (err: any) {
            console.error('[Magnee] Direct execution failed:', err);
        }
    });
}

// ============================================================================
// Provider Installation
// ============================================================================

// 1. Wrap existing window.ethereum
if (window.ethereum) {
    wrapProvider(window.ethereum);
}

// 2. Trap future window.ethereum assignments
function installTrap(): boolean {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
        if (descriptor && !descriptor.configurable) {
            console.info('[Magnee] window.ethereum is not configurable. Skipping trap.');
            return false;
        }

        let _ethereum = window.ethereum;
        Object.defineProperty(window, 'ethereum', {
            get() { return _ethereum; },
            set(newProvider) {
                console.log('[Magnee] window.ethereum being overwritten', newProvider);
                _ethereum = wrapProvider(newProvider);
            },
            configurable: true
        });
        return true;
    } catch (e) {
        console.warn('[Magnee] Failed to install trap:', e);
        return false;
    }
}

if (!installTrap()) {
    // Fallback: Poll for changes if we couldn't trap the setter
    let lastEth = window.ethereum;
    setInterval(() => {
        if (window.ethereum !== lastEth) {
            console.log('[Magnee] Detected window.ethereum change via polling');
            wrapProvider(window.ethereum!);
            lastEth = window.ethereum;
        }
    }, 100);
}

// 3. EIP-6963 Interception
window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
    const provider = event.detail.provider;
    if (provider && !provider._magneeWrapped) {
        console.log('[Magnee] EIP-6963 provider announced:', event.detail.info.name);
        wrapProvider(provider);
        // Proactively check if this provider has accounts → mark as active
        provider.request({ method: 'eth_accounts' }).then((accs: string[]) => {
            if (accs && accs.length > 0) {
                (window as any).__magneeActiveProvider = provider;
                console.log('[Magnee] Active provider set:', event.detail.info.name, accs[0]);
            }
        }).catch(() => {});
    }
}) as EventListener);

console.log('[Magnee] Injection complete');

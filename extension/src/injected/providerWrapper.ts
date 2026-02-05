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

    // Override request method
    provider.request = async function (args: { method: string; params?: any[] }) {
        console.log('[Magnee] Intercepted request:', args);

        // Only intercept eth_sendTransaction
        if (args.method === 'eth_sendTransaction') {
            const tx = args.params?.[0];
            
            try {
                // Check if this is a payable transaction
                if (tx && tx.value && BigInt(tx.value) > 0n) {
                    const chainId = await getCurrentChainId(originalRequest);
                    return handlePayableTransaction(tx, chainId, args, originalRequest);
                } else {
                    console.log('[Magnee] Tx skipped: No value or value is 0', tx?.value);
                }
            } catch (err) {
                console.error('[Magnee] Interception logic failed:', err);
            }
        }

        // Forward all other requests unchanged
        return originalRequest(args);
    };

    // Install direct execution listener (once globally)
    installDirectExecutionListener(originalRequest);

    provider._magneeWrapped = true;
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
    }
}) as EventListener);

console.log('[Magnee] Injection complete');

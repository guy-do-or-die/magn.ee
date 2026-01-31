import { createMagneefiedTx } from './magneeUtils';

console.log('[Magnee] Provider wrapper injecting...');

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

function wrapProvider(provider: EthereumProvider) {
    if (!provider || provider._magneeWrapped) return provider;

    console.log('[Magnee] Wrapping provider:', provider);

    // Bind original request
    const originalRequest = provider.request.bind(provider);

    // Override request
    provider.request = async function (args: { method: string; params?: any[] }) {
        console.log('[Magnee] Intercepted request:', args);

        if (args.method === 'eth_sendTransaction') {
            const tx = args.params?.[0];

            if (tx && tx.value && BigInt(tx.value) > 0n) {
                console.log('[Magnee] Found payable transaction:', tx);

                return new Promise((resolve, reject) => {
                    const reqId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

                    const handleResponse = (event: MessageEvent) => {
                        if (event.source !== window ||
                            event.data?.type !== 'MAGNEE_FROM_BACKGROUND' ||
                            event.data?.id !== reqId) {
                            return;
                        }

                        window.removeEventListener('message', handleResponse);

                        // Handle error response from background/popup
                        if (event.data.payload?.error) {
                            console.error('[Magnee] Error from UI:', event.data.payload.error);
                            resolve(originalRequest(args));
                            return;
                        }

                        const { action } = event.data.payload || {};
                        console.log('[Magnee] Received response action:', action);

                        if (action === 'MAGNEEFY') {
                            console.log('[Magnee] User chose to Magneefy! Rewriting transaction...');
                            // Use shared logic from Utils
                            const newTx = createMagneefiedTx(tx);
                            console.log('[Magnee] Rewritten Tx:', newTx);

                            const newArgs = { ...args };
                            newArgs.params = [newTx];

                            resolve(originalRequest(newArgs));

                        } else if (action === 'REJECT') {
                            reject(new Error('User rejected transaction via Magnee'));
                        } else {
                            console.log('[Magnee] User chose original flow');
                            resolve(originalRequest(args));
                        }
                    };

                    window.addEventListener('message', handleResponse);

                    window.postMessage({
                        type: 'MAGNEE_TO_BACKGROUND',
                        id: reqId,
                        payload: tx
                    }, '*');
                });
            }
        }

        return originalRequest(args);
    };

    provider._magneeWrapped = true;
    return provider;
}

// 1. Wrap existing window.ethereum
if (window.ethereum) {
    wrapProvider(window.ethereum);
}

// 2. Trap future window.ethereum assignments (Safely)
function installTrap() {
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
            // @ts-ignore
            wrapProvider(window.ethereum);
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

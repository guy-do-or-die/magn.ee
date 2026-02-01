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

        // Check for transaction
        if (args.method === 'eth_sendTransaction') {
            const tx = args.params?.[0];
            console.log('[Magnee] Inspecting tx:', tx);

            try {
                if (tx && tx.value && BigInt(tx.value) > 0n) {
                    console.log('[Magnee] Found payable transaction:', tx);

                    // Fetch current Chain ID to inform the UI
                    const chainIdHex = await originalRequest({ method: 'eth_chainId' });
                    const chainId = parseInt(chainIdHex, 16);
                    console.log('[Magnee] Current Chain ID:', chainId);

                    return new Promise((resolve, reject) => {
                        const reqId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                        const payload = {
                            ...tx,
                            chainId // Inject chainId into the tx object for UI
                        };

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

                            const { action, route } = event.data.payload || {};
                            console.log('[Magnee] Received response action:', action, route);

                            if (action === 'MAGNEEFY') {
                                console.log('[Magnee] User chose to Magneefy! Rewriting transaction...');
                                // Use shared logic from Utils
                                const newTx = createMagneefiedTx(tx, route);
                                console.log('[Magnee] Rewritten Tx:', newTx);

                                const newArgs = { ...args };
                                newArgs.params = [newTx];

                                resolve(originalRequest(newArgs));

                            } else if (action === 'REJECT') {
                                reject(new Error('User rejected transaction via Magnee'));
                            } else {
                                console.log('[Magnee] User chose original flow');

                                // Helper to ensure Hex string
                                const toHex = (val: any) => {
                                    if (val === undefined || val === null) return undefined;
                                    if (typeof val === 'bigint') return `0x${val.toString(16)}`;
                                    if (typeof val === 'number') return `0x${val.toString(16)}`;
                                    return val; // Assume string is already hex
                                };

                                // Sanitize the tx object to ensure no Proxy/weird artifacts
                                // AND enforce Hex strings for RPC compliance
                                const safeTx = {
                                    from: tx.from,
                                    to: tx.to,
                                    value: toHex(tx.value),
                                    data: tx.data,
                                    gas: toHex(tx.gas),
                                    gasPrice: toHex(tx.gasPrice), // optional
                                    maxFeePerGas: toHex(tx.maxFeePerGas), // optional
                                    maxPriorityFeePerGas: toHex(tx.maxPriorityFeePerGas), // optional
                                    nonce: toHex(tx.nonce) // optional
                                };

                                // Strip undefined keys
                                Object.keys(safeTx).forEach(key => (safeTx as any)[key] === undefined && delete (safeTx as any)[key]);

                                const cleanArgs = {
                                    method: args.method,
                                    params: [safeTx, ...(args.params ? args.params.slice(1) : [])]
                                };

                                console.log('[Magnee] Forwarding sanitized request:', cleanArgs);
                                resolve(originalRequest(cleanArgs));
                            }
                        };

                        window.addEventListener('message', handleResponse);

                        window.postMessage({
                            type: 'MAGNEE_TO_BACKGROUND',
                            id: reqId,
                            payload // Send enriched payload with chainId
                        }, '*');
                    });
                } else {
                    console.log('[Magnee] Tx skipped: No value or value is 0', tx?.value);
                }
            } catch (err) {
                console.error('[Magnee] Interception logic failed:', err);
            }
        }

        return originalRequest(args);
    };

    // Listen for direct execution requests (Bypass Interception)
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        if (event.data?.type === 'MAGNEE_EXECUTE_TX') {
            const { tx, reqId, chainId } = event.data.payload;
            console.log('[Magnee Provider] Received MAGNEE_EXECUTE_TX:', tx, 'TargetChain:', chainId);

            if (!originalRequest) {
                console.error('[Magnee Provider] originalRequest is missing!');
                return;
            }

            try {
                // 1. Check Chain ID
                if (chainId) {
                    const currentChainIdHex = await originalRequest({ method: 'eth_chainId' });
                    const currentChainId = parseInt(currentChainIdHex, 16);
                    console.log('[Magnee Provider] Current Chain:', currentChainId, 'Needed:', chainId);

                    if (currentChainId !== chainId) {
                        console.log('[Magnee Provider] Switching chain...');
                        try {
                            await originalRequest({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: `0x${chainId.toString(16)}` }]
                            });
                            console.log('[Magnee Provider] Chain switched successfully');
                        } catch (switchError: any) {
                            // This error code indicates that the chain has not been added to MetaMask.
                            if (switchError.code === 4902) {
                                console.error('[Magnee Provider] Chain not added to wallet. Add chain logic needed here.');
                                // For Pilot, we assume major chains are present or user can add manually.
                                alert("Please add the network to your wallet first.");
                            }
                            throw switchError;
                        }
                    }
                }

                // 2. Execute Transaction
                console.log('[Magnee Provider] Calling originalRequest (bypass)...');
                const hash = await originalRequest({
                    method: 'eth_sendTransaction',
                    params: [tx]
                });
                console.log('[Magnee Provider] Bypass Tx Success! Hash:', hash);

            } catch (err: any) {
                console.error('[Magnee Provider] Bypass Tx Failed:', err);
                // We can maybe emit an error event back to content script?
                // But the flow is one-way for now.
            }
        }
    });

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

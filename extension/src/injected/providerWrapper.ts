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

                        const handleResponse = async (event: MessageEvent) => {
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

                            // Shared switching logic
                            const ensureChain = async (targetChainId: number) => {
                                try {
                                    const currentChainIdHex = await originalRequest({ method: 'eth_chainId' });
                                    const currentChainId = parseInt(currentChainIdHex, 16);
                                    console.log(`[Magnee] Chain Check. Current: ${currentChainId}, Target: ${targetChainId}`);

                                    if (currentChainId !== targetChainId) {
                                        console.log(`[Magnee] Switching to ${targetChainId}...`);
                                        try {
                                            await originalRequest({
                                                method: 'wallet_switchEthereumChain',
                                                params: [{ chainId: `0x${targetChainId.toString(16)}` }]
                                            });
                                            console.log('[Magnee] Switch requested. Waiting 1s...');
                                            await new Promise(r => setTimeout(r, 1000));
                                            return true;
                                        } catch (switchErr: any) {
                                            console.error('[Magnee] Switch failed:', switchErr);
                                            if (switchErr.code === 4902) {
                                                alert(`Magnee: Chain ID ${targetChainId} not found. Add it manually.`);
                                            } else {
                                                alert(`Magnee: Auto-switch to ${targetChainId} failed. Please switch manually.`);
                                            }
                                            return false; // Failed but maybe user did it manually?
                                        }
                                    }
                                    return true; // Already on correct chain
                                } catch (err) {
                                    console.error('[Magnee] Chain check error:', err);
                                    return false;
                                }
                            };

                            if (action === 'MAGNEEFY') {
                                console.log('[Magnee] User chose to Magneefy!');

                                // Use shared helper
                                if (route?.chainId) {
                                    await ensureChain(route.chainId);
                                }

                                const newTx = createMagneefiedTx(tx, route);
                                console.log('[Magnee] Rewritten Tx:', newTx);

                                const newArgs = { ...args };
                                newArgs.params = [newTx];

                                resolve(originalRequest(newArgs));

                            } else if (action === 'REJECT') {
                                reject(new Error('User rejected transaction via Magnee'));
                            } else {
                                console.log('[Magnee] Forwarding original...');
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
    // Ensure we only attach one listener, bound to the primary provider (first one wrapped)
    if (!(window as any).MAGNEE_LISTENER_INSTALLED) {
        (window as any).MAGNEE_LISTENER_INSTALLED = true;
        console.log('[Magnee] Attaching global execution listener');

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
                    // Shared switching logic (re-implemented since we can't easily scope share across event callbacks without globals)
                    // In a perfect world we'd move `ensureChain` to a higher scope, but for now we duplicate the simple helper within this closure to rely on `originalRequest`
                    if (chainId) {
                        try {
                            const currentChainIdHex = await originalRequest({ method: 'eth_chainId' });
                            const currentChainId = parseInt(currentChainIdHex, 16);
                            console.log(`[Magnee Provider] Approval Auto-switch check. Current: ${currentChainId}, Required: ${chainId}`);

                            if (currentChainId !== chainId) {
                                console.log(`[Magnee Provider] Switching to ${chainId}...`);
                                try {
                                    await originalRequest({
                                        method: 'wallet_switchEthereumChain',
                                        params: [{ chainId: `0x${chainId.toString(16)}` }]
                                    });
                                    console.log('[Magnee Provider] Switch request sent. Waiting 1s...');
                                    await new Promise(r => setTimeout(r, 1000));
                                } catch (switchErr: any) {
                                    console.error('[Magnee Provider] Switch failed:', switchErr);
                                    if (switchErr.code === 4902) {
                                        alert(`Magnee: Chain ID ${chainId} not found. Add it manually.`);
                                    } else {
                                        alert(`Magnee: Auto-switch to ${chainId} failed. Please switch manually.`);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('[Magnee Provider] Chain check error:', err);
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
                }
            }
        });
    }

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

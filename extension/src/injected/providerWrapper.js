console.log('[Magnee] Provider wrapper injecting...');

function wrapProvider(provider) {
    if (!provider || provider._magneeWrapped) return provider;

    console.log('[Magnee] Wrapping provider:', provider);

    const originalRequest = provider.request.bind(provider);

    provider.request = async function (args) {
        console.log('[Magnee] Intercepted request:', args);

        if (args.method === 'eth_sendTransaction') {
            const tx = args.params?.[0];

            if (tx && tx.value && BigInt(tx.value) > 0n) {
                console.log('[Magnee] Found payable transaction:', tx);

                return new Promise((resolve, reject) => {
                    const reqId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

                    const handleResponse = (event) => {
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

                            // ROUTER ADDRESS (from Anvil deploy)
                            const ROUTER_ADDR = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

                            // 1. Prepare Calldata for forward(address target, bytes data)
                            // Selector: 0xd948d468
                            const selector = '0xd948d468';

                            // Param 1: Target Address (padded to 32 bytes)
                            const target = tx.to.startsWith('0x') ? tx.to.slice(2) : tx.to;
                            const targetPadded = target.padStart(64, '0');

                            // Data handling
                            const originalData = (tx.data && tx.data !== '0x') ? (tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data) : '';
                            const dataLength = originalData.length / 2;

                            // Param 2: Offset to bytes (0x40 = 64 bytes)
                            const offsetPadded = '0000000000000000000000000000000000000000000000000000000000000040';

                            // Param 3: Length of bytes
                            const lengthPadded = dataLength.toString(16).padStart(64, '0');

                            // Param 4: Data itself (padded to 32 bytes)
                            const dataContent = originalData.padEnd(Math.ceil(originalData.length / 64) * 64, '0');

                            const newData = selector + targetPadded + offsetPadded + lengthPadded + dataContent;

                            // Construct new tx object
                            const newTx = { ...tx };
                            newTx.to = ROUTER_ADDR;
                            newTx.data = newData;
                            // Keep value same for now (ETH passthrough)

                            console.log('[Magnee] Rewritten Tx:', newTx);

                            // Update args with new tx
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

// 2. Trap future window.ethereum assignments (for Rabby/MetaMask overwrite)
try {
    let _ethereum = window.ethereum;
    Object.defineProperty(window, 'ethereum', {
        get() { return _ethereum; },
        set(newProvider) {
            console.log('[Magnee] window.ethereum being overwritten', newProvider);
            _ethereum = wrapProvider(newProvider);
        },
        configurable: true
    });
} catch (e) {
    console.warn('[Magnee] Cannot redefine window.ethereum (already locked?):', e);
    // Fallback: Poll for changes if we couldn't trap the setter
    let lastEth = window.ethereum;
    setInterval(() => {
        if (window.ethereum !== lastEth) {
            console.log('[Magnee] Detected window.ethereum change via polling');
            wrapProvider(window.ethereum);
            lastEth = window.ethereum;
        }
    }, 100);
}

// 3. EIP-6963 Interception
window.addEventListener('eip6963:announceProvider', (event) => {
    const provider = event.detail.provider;
    if (provider && !provider._magneeWrapped) {
        console.log('[Magnee] EIP-6963 provider announced:', event.detail.info.name);
        wrapProvider(provider);
    }
});

console.log('[Magnee] Injection complete');

// Injected provider wrapper: intercepts window.ethereum.request calls
// This runs in the page context (main world)

(function () {
    // Wait for ethereum provider to appear
    const checkAndWrap = () => {
        if (typeof window.ethereum === 'undefined') {
            return false;
        }

        // Don't wrap twice
        if (window.ethereum._magneeWrapped) {
            return true;
        }

        const originalRequest = window.ethereum.request.bind(window.ethereum);

        // Wrap the request method
        window.ethereum.request = async function (args) {
            console.log('[Magnee] Intercepted request:', args);

            // Check if this is a transaction with value (candidate for Magnee)
            if (args.method === 'eth_sendTransaction') {
                const tx = args.params?.[0];

                if (tx && tx.value && BigInt(tx.value) > 0n) {
                    console.log('[Magnee] Found payable transaction:', tx);

                    // For this spike: just log and pass through
                    // TODO: Show UI, get quote, rewrite tx
                    console.log('[Magnee] Candidate for Magneefy:', {
                        to: tx.to,
                        value: tx.value,
                        data: tx.data || '0x'
                    });

                    // For now, add a marker that we saw it
                    console.log('[Magnee] Passing through original tx (spike mode)');
                }
            }

            // Always pass through to original for now
            return originalRequest(args);
        };

        window.ethereum._magneeWrapped = true;
        console.log('[Magnee] Provider wrapped successfully');
        return true;
    };

    // Try immediately
    if (!checkAndWrap()) {
        // Fallback: watch for provider to appear
        let attempts = 0;
        const maxAttempts = 50;

        const interval = setInterval(() => {
            attempts++;
            if (checkAndWrap() || attempts >= maxAttempts) {
                clearInterval(interval);
                if (attempts >= maxAttempts) {
                    console.log('[Magnee] No ethereum provider found after waiting');
                }
            }
        }, 100);

        // Also listen for provider announcement (EIP-6963)
        window.addEventListener('eip6963:announceProvider', (event) => {
            console.log('[Magnee] EIP-6963 provider announced:', event.detail);
            // Could wrap this provider too
        });
    }
})();

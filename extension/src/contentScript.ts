// Content script: injects the provider wrapper into the page context
// This runs in the content script context (isolated world)

(function () {
    // Inject the provider wrapper script into the page
    const script = document.createElement('script');
    // NOTE: This points to the BUILT wrapper in dist/src/injected/providerWrapper.js
    // Vite config ensures this path exists.
    script.src = chrome.runtime.getURL('src/injected/providerWrapper.js');
    script.type = 'module';

    // Inject as early as possible
    (document.head || document.documentElement).appendChild(script);

    // Bridge messages: Page -> Background
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (event.data?.type === 'MAGNEE_TO_BACKGROUND') {
            console.log('[Magnee Content] Forwarding to BG:', event.data);

            // Forward Request to Background
            if (!chrome.runtime?.id) {
                console.warn('[Magnee] Extension context invalidated. Please refresh the page.');
                return;
            }

            chrome.runtime.sendMessage({
                type: 'MAGNEE_TX',
                payload: event.data.payload
            }, (response) => {
                // Check for runtime errors (like context invalidation during request)
                if (chrome.runtime.lastError) {
                    console.warn('[Magnee] Runtime connection failed:', chrome.runtime.lastError.message);
                    return;
                }

                // Send Response back to Page
                console.log('[Magnee Content] Response from BG:', response);
                window.postMessage({
                    type: 'MAGNEE_FROM_BACKGROUND',
                    id: event.data.id,
                    payload: response
                }, '*');
            });
        }
    });

    console.log('[Magnee] Content script loaded');
})();

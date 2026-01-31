// Content script: injects the provider wrapper into the page context
// This runs in the content script context (isolated world)

(function () {
    // Inject the provider wrapper script into the page
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/injected/providerWrapper.js');
    script.type = 'module';

    // Inject as early as possible
    (document.head || document.documentElement).appendChild(script);

    // Bridge messages between page and extension
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type === 'MAGNEE_TO_BACKGROUND') {
            // Forward to background script
            chrome.runtime.sendMessage(event.data.payload, (response) => {
                window.postMessage({
                    type: 'MAGNEE_FROM_BACKGROUND',
                    id: event.data.id,
                    payload: response
                }, '*');
            });
        }
    });

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'MAGNEE_TO_PAGE') {
            window.postMessage({
                type: 'MAGNEE_FROM_BACKGROUND',
                payload: message.payload
            }, '*');
        }
    });

    console.log('[Magnee] Content script loaded');
})();

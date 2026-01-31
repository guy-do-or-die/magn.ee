// Background service worker
// Handles messages from content script and performs quoting/validation

// Track router address (will be configurable)
const ROUTER_ADDRESS = '0x0000000000000000000000000000000000000000'; // Placeholder

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Magnee BG] Received message:', message);

    if (message.type === 'MAGNEE_TX') {
        // Handle transaction interception
        const { to, value, data } = message.payload;

        console.log('[Magnee BG] Processing tx candidate:', {
            to,
            value,
            data
        });

        // For spike: just acknowledge
        sendResponse({ status: 'received', shouldMagneefy: false });
        return true;
    }

    // Default response
    sendResponse({ status: 'unknown' });
    return true;
});

console.log('[Magnee BG] Service worker started');

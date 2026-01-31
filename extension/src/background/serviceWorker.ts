// Background service worker
// Handles messages from content script and performs quoting/validation

// Track router address (will be configurable)
const ROUTER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

interface PendingRequest {
    callback: (response: any) => void;
    payload: {
        to: string;
        value: string;
        data: string;
    };
}

// Store pending requests: reqId -> { callback, payload }
const pendingRequests = new Map<string, PendingRequest>();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MAGNEE_TX') {
        const { to, value, data } = message.payload;

        const reqId = Date.now().toString(); // Internal ID for background<->popup

        // Store secure payload and callback in memory
        pendingRequests.set(reqId, {
            callback: sendResponse,
            payload: { to, value, data }
        });

        console.log('[Magnee BG] Opening approval popup for:', reqId);

        chrome.windows.create({
            url: `src/ui/popup.html?id=${reqId}`, // Updated to popup.html
            type: 'popup',
            width: 420,
            height: 650,
            focused: true
        });

        return true; // Keep channel open
    }

    if (message.type === 'GET_TX_DETAILS') {
        const { id } = message;
        console.log('[Magnee BG] Popup requesting details for:', id);

        const req = pendingRequests.get(id);
        if (req) {
            sendResponse(req.payload);
        } else {
            sendResponse({ error: 'Request expired or not found' });
        }
        return false; // Sync response
    }

    if (message.type === 'MAGNEE_DECISION') {
        const { id, action } = message.payload;
        console.log('[Magnee BG] Received decision:', id, action);

        const req = pendingRequests.get(id);
        if (req && req.callback) {
            req.callback({ action });
            pendingRequests.delete(id);
        }
        return true;
    }
});

console.log('[Magnee BG] Service worker started');

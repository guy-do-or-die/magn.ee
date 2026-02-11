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
        from?: string;
        chainId?: number;
        detectedAction?: any;
    };
    tabId?: number; // Store origin tab
}

// Store pending requests: reqId -> { callback, payload }
const pendingRequests = new Map<string, PendingRequest>();

// Keyboard shortcut handler - Ctrl+Shift+I to toggle interception
chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-interception') {
        chrome.storage.local.get(['interceptionEnabled'], (result) => {
            const currentState = result.interceptionEnabled !== false; // default true
            const newState = !currentState;
            chrome.storage.local.set({ interceptionEnabled: newState });
            console.log('[Magnee BG] Interception toggled:', newState ? 'ON' : 'OFF');
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MAGNEE_TX') {
        const { to, value, data, from, chainId, detectedAction } = message.payload;

        // Use ID from content script if available to match status updates
        const reqId = message.id || Date.now().toString();

        // Store secure payload and callback in memory
        pendingRequests.set(reqId, {
            callback: sendResponse,
            payload: { to, value: value || '0x0', data, from, chainId, detectedAction },
            tabId: sender.tab?.id
        });

        console.log('[Magnee BG] Opening approval popup for:', reqId, 'Chain:', chainId);

        chrome.windows.create({
            url: `src/ui/intercept.html?id=${reqId}`,
            type: 'popup',
            width: 500,
            height: 1000,
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
        const { id, action, route } = message.payload;
        console.log('[Magnee BG] Received decision:', id, action, route);

        const req = pendingRequests.get(id);
        if (req && req.callback) {
            req.callback({ action, route });
            pendingRequests.delete(id);
        }
        return true;
    }

    if (message.type === 'MAGNEE_TRIGGER_TX') {
        const { tx, reqId } = message.payload;
        console.log('[Magnee BG] Triggering Side-Effect Tx:', reqId, tx);

        // We need to find the tab ID for this request.
        // currently we don't store tabId in pendingRequests. 
        // BUT, we can query active tabs or broadcast? 
        // BETTER: Service worker should have stored the Tab ID when `MAGNEE_TX` came in.
        // Let's assume we fix that later. For now, try to find the active tab or broadcast.

        // Actually, let's fix the storage first.
        const req = pendingRequests.get(reqId);
        if (!req) {
            sendResponse({ error: 'Request context lost' });
            return false;
        }

        const targetTabId = req.tabId;
        if (targetTabId) {
            console.log('[Magnee BG] Sending EXECUTE_TX to tab:', targetTabId);
            chrome.tabs.sendMessage(targetTabId, {
                type: 'MAGNEE_EXECUTE_TX',
                payload: {
                    tx,
                    reqId,
                    chainId: message.payload.chainId // Forward the chainID!
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Magnee BG] Failed to send to tab:', chrome.runtime.lastError);
                    sendResponse({ error: 'Failed to contact tab: ' + chrome.runtime.lastError.message });
                } else {
                    console.log('[Magnee BG] Exec response:', response);
                    sendResponse(response);
                }
            });
            return true; // Async response pending from tab
        } else {
            sendResponse({ error: 'Target tab ID missing' });
            return false;
        }
    }

    if (message.type === 'WALLET_RPC') {
        const { method, params, reqId } = message.payload;
        console.log('[Magnee BG] WALLET_RPC:', method, 'reqId:', reqId);

        // Find the tab to execute on — use stored tabId from the pending request
        const req = reqId ? pendingRequests.get(reqId) : null;
        const tabId = req?.tabId;

        if (!tabId) {
            // Fallback: find any active http tab
            chrome.tabs.query({ active: true }, (tabs) => {
                const httpTab = tabs.find(t => t.url?.startsWith('http'));
                if (!httpTab?.id) {
                    sendResponse({ ok: false, error: 'No dapp tab found' });
                    return;
                }
                executeWalletRPC(httpTab.id, method, params ?? [], sendResponse);
            });
            return true;
        }

        executeWalletRPC(tabId, method, params ?? [], sendResponse);
        return true;
    }
});

function executeWalletRPC(tabId: number, method: string, params: any[], sendResponse: (r: any) => void) {
    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [method, params],
        func: async (method: string, params: any[]) => {
            // Set bridge flag so providerWrapper allows chain switches from us
            // (while blocking the same calls from dapps like Aave during processing)
            // @ts-ignore
            window.__magneeFromBridge = true;

            try {
                // 1. Try the active provider (set by providerWrapper when accounts are detected)
                // @ts-ignore
                const active = window.__magneeActiveProvider;
                if (active) {
                    try {
                        const result = await active.request({ method, params });
                        return { ok: true, result };
                    } catch (e: any) {
                        return { ok: false, error: e?.message ?? String(e) };
                    }
                }

                // 2. Fallback: window.ethereum
                // @ts-ignore
                if (!window.ethereum) return { ok: false, error: 'No wallet on this page' };
                try {
                    // @ts-ignore
                    const result = await window.ethereum.request({ method, params });
                    return { ok: true, result };
                } catch (e: any) {
                    return { ok: false, error: e?.message ?? String(e) };
                }
            } finally {
                // @ts-ignore
                window.__magneeFromBridge = false;
            }
        }
    }).then(([execResult]) => {
        sendResponse(execResult?.result ?? { ok: false, error: 'No result' });
    }).catch(err => {
        sendResponse({ ok: false, error: err?.message ?? String(err) });
    });
}

console.log('[Magnee BG] Service worker started');

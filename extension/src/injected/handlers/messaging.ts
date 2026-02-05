/**
 * Window messaging utilities for Magnee extension
 * Handles communication between injected script and background/popup
 */

import type { Route } from '../magneeUtils';

export interface MagneeResponse {
    action: 'MAGNEEFY' | 'REJECT' | 'FORWARD';
    route?: Route;
    error?: string;
}

/**
 * Generate a unique request ID
 */
export function generateReqId(): string {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Send message to background script
 */
export function sendToBackground(reqId: string, payload: any): void {
    window.postMessage({
        type: 'MAGNEE_TO_BACKGROUND',
        id: reqId,
        payload
    }, '*');
}

/**
 * Wait for response from background/popup
 * Returns a promise that resolves when the response is received
 */
export function waitForResponse(reqId: string): Promise<MagneeResponse> {
    return new Promise((resolve, reject) => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== window ||
                event.data?.type !== 'MAGNEE_FROM_BACKGROUND' ||
                event.data?.id !== reqId) {
                return;
            }

            window.removeEventListener('message', handleMessage);

            if (event.data.payload?.error) {
                reject(new Error(event.data.payload.error));
                return;
            }

            const { action, route } = event.data.payload || {};
            resolve({ action, route });
        };

        window.addEventListener('message', handleMessage);
    });
}

/**
 * Send and wait for response in one call
 */
export async function requestFromBackground(payload: any): Promise<MagneeResponse> {
    const reqId = generateReqId();
    
    // Start listening before sending
    const responsePromise = waitForResponse(reqId);
    
    // Send the request
    sendToBackground(reqId, payload);
    
    // Wait for response
    return responsePromise;
}

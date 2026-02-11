/**
 * Transaction handling logic for Magnee interception
 * Handles MAGNEEFY, REJECT, and FORWARD actions
 */

import { createMagneefiedTx, buildWalletSendCalls, getCallsFromRoute, type Route } from '../magneeUtils';
import { ensureChain, sanitizeTx, type RequestFn } from './chainUtils';
import { requestFromBackground } from './messaging';
import type { DetectedAction } from '../../lib/actions';

/**
 * Wait for a transaction to be confirmed
 */
async function waitForTxConfirmation(
    requestFn: RequestFn,
    txHash: string,
    maxAttempts: number = 30
): Promise<boolean> {
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const receipt = await requestFn({
                method: 'eth_getTransactionReceipt',
                params: [txHash]
            });
            if (receipt && receipt.status === '0x1') {
                console.log('[Magnee] Tx confirmed!');
                return true;
            } else if (receipt && receipt.status === '0x0') {
                throw new Error('Transaction reverted');
            }
        } catch (e) {
            // Receipt not available yet
        }
        attempts++;
    }
    console.warn('[Magnee] Confirmation timed out');
    return false;
}

/**
 * Broadcast execution status to UI via Content Script
 */
function broadcastStatus(msg: string, status: string, id?: string) {
    if (!id) return;
    window.postMessage({
        type: 'MAGNEE_STATUS_UPDATE',
        payload: { message: msg, status, id }
    }, '*');
}

/**
 * Execute batched transactions using ERC-5792 or sequential fallback
 */
async function executeBatchedTx(
    tx: any,
    route: Route,
    requestFn: RequestFn,
    reqId?: string,
    destChainId?: number
): Promise<string> {
    // Try ERC-5792 wallet_sendCalls first
    const sendCallsRequest = buildWalletSendCalls(tx.from, route.chainId, route);
    if (sendCallsRequest) {
        try {
            const msg = 'Sending wallet_sendCalls batch request...';
            console.log('[Magnee]', msg, sendCallsRequest);
            broadcastStatus(msg, 'in_progress', reqId);
            
            const batchResult = await requestFn(sendCallsRequest);
            console.log('[Magnee] wallet_sendCalls result:', batchResult);
            
            // Poll wallet_getCallsStatus until confirmed (ERC-5792)
            const batchId = batchResult?.id || batchResult;
            if (batchId) {
            broadcastStatus(`Batch submitted`, 'in_progress', reqId);
                console.log('[Magnee] Polling status for batch ID:', batchId);
                
                let attempts = 0;
                const maxAttempts = 20; // ~30 seconds to get initial confirmation
                
                while (attempts < maxAttempts) {
                    try {
                        const status = await requestFn({
                            method: 'wallet_getCallsStatus',
                            params: [batchId]
                        });
                        console.log('[Magnee] Batch status:', status);
                        
                        // MetaMask returns status: 200 (number) with receipts
                        // ERC-5792 spec says status: 'CONFIRMED' (string)
                        const isConfirmed = status?.status === 'CONFIRMED' 
                            || status?.status === 200
                            || (status?.receipts?.length > 0 && status?.receipts?.[0]?.blockHash);
                        
                        if (isConfirmed) {
                            const txHash = status.receipts?.[0]?.transactionHash || batchId;
                            console.log('[Magnee] Batch confirmed! Hash:', txHash);
                            
                            // Wait for 3 block confirmations
                            const totalConfirmations = 3;
                            for (let c = 1; c <= totalConfirmations; c++) {
                                broadcastStatus(`Confirmation ${c}/${totalConfirmations}`, 'in_progress', reqId);
                                if (c < totalConfirmations) {
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    // Re-check receipt to verify block depth
                                    try {
                                        await requestFn({ method: 'eth_getTransactionReceipt', params: [txHash] });
                                    } catch {}
                                }
                            }
                            
                            broadcastStatus('Batch confirmed on-chain', 'CONFIRMED', reqId);
                            
                            if (reqId) {
                                window.postMessage({
                                    type: 'MAGNEEFY_COMPLETED',
                                    payload: { 
                                        id: reqId, status: 'success',
                                        txHash,
                                        sourceChainId: route.chainId,
                                        destChainId
                                    }
                                }, '*');
                            }

                            return txHash;
                        }
                        
                        const isFailed = status?.status === 'FAILED' || status?.status === 500;
                        if (isFailed) {
                            const errMs = `Batch failed: ${status.error || 'Unknown error'}`;
                            broadcastStatus(errMs, 'FAILED', reqId);
                            throw new Error(errMs);
                        }
                        
                        // Still pending
                        broadcastStatus(`Waiting for confirmation`, 'in_progress', reqId);
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        attempts++;
                    } catch (statusErr: any) {
                        console.error('[Magnee] Error checking batch status:', statusErr);
                        // If checking status fails, assume we can't track it and return ID
                        return batchId;
                    }
                }
                
                broadcastStatus('Polling timed out, check wallet for status', 'done', reqId);
                return batchId;
            }
            
            return batchResult;
        } catch (erc5792Err: any) {
            console.log('[Magnee] wallet_sendCalls not supported:', erc5792Err?.message);
            broadcastStatus('wallet_sendCalls failed, trying sequential fallback...', 'in_progress', reqId);
        }
    }

    // Fallback: Sequential transactions
    broadcastStatus('Falling back to sequential transactions...', 'in_progress', reqId);
    const calls = getCallsFromRoute(route);
    let lastHash: string = '';

    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const isLast = i === calls.length - 1;

        const stepMsg = `Sending transaction ${i + 1}/${calls.length}...`;
        console.log(`[Magnee] ${stepMsg}`, call);
        broadcastStatus(stepMsg, 'in_progress', reqId);

        const txRequest = {
            from: tx.from,
            to: call.to,
            value: call.value || '0x0',
            data: call.data
        };

        const txHash = await requestFn({
            method: 'eth_sendTransaction',
            params: [txRequest]
        });
        
        broadcastStatus(`Tx ${i + 1} sent`, 'in_progress', reqId);
        lastHash = txHash;

        // Wait for confirmation before next tx (except last)
        if (!isLast) {
            broadcastStatus('Waiting for confirmation...', 'in_progress', reqId);
            await waitForTxConfirmation(requestFn, txHash);
            broadcastStatus(`Tx ${i + 1} confirmed`, 'in_progress', reqId);
        }
    }

    broadcastStatus('All transactions completed successfully', 'CONFIRMED', reqId);

    if (reqId) {
        window.postMessage({
            type: 'MAGNEEFY_COMPLETED',
            payload: { 
                id: reqId, status: 'success',
                txHash: lastHash,
                sourceChainId: route.chainId,
                destChainId
            }
        }, '*');
    }

    return lastHash;
}

// ... ensureDelegations ...

/**
 * Handle MAGNEEFY action - execute the modified transaction
 */
async function handleMagneefy(
    tx: any,
    route: Route | undefined,
    originalArgs: any,
    requestFn: RequestFn,
    reqId?: string
): Promise<string> {
    console.log('[Magnee] User chose to Magneefy!');
    if (reqId) broadcastStatus('Starting execution in Dapp context...', 'in_progress', reqId);

    // Switch to target chain if needed
    if (route?.chainId) {
        if (reqId) broadcastStatus(`Ensuring chain...`, 'in_progress', reqId);
        await ensureChain(requestFn, route.chainId);
    }

    const newTx = createMagneefiedTx(tx, route);
    console.log('[Magnee] Rewritten Tx:', newTx);

    // Check if batching is required
    if (newTx._requiresBatching && route) {
        return executeBatchedTx(tx, route, requestFn, reqId, tx.chainId);
    }

    // Single transaction
    if (reqId) broadcastStatus('Sending single transaction...', 'in_progress', reqId);
    const hash = await requestFn({
        method: 'eth_sendTransaction',
        params: [newTx]
    });
    
    if (reqId) broadcastStatus(`Transaction sent! Hash: ${hash.slice(0, 10)}...`, 'CONFIRMED', reqId);
    return hash;
}

// ... handleForward ...

/**
 * Handle FORWARD action - sanitize and forward original tx
 */
async function handleForward(
    tx: any,
    originalArgs: any,
    requestFn: RequestFn
): Promise<string> {
    console.log('[Magnee] Forwarding original...');
    const safeTx = sanitizeTx(tx);
    const cleanArgs = {
        method: originalArgs.method,
        params: [safeTx, ...(originalArgs.params ? originalArgs.params.slice(1) : [])]
    };
    console.log('[Magnee] Forwarding sanitized request:', cleanArgs);
    return requestFn(cleanArgs);
}

/**
 * Main handler for intercepted transactions
 * Shows Magnee popup and handles user response
 */
export async function handleInterceptedTransaction(
    tx: any,
    chainId: number,
    action: DetectedAction,
    originalArgs: any,
    requestFn: RequestFn
): Promise<string> {
    console.log('[Magnee] Intercepted transaction:', action.type, tx);

    // Enrich tx with chain ID and detected action for UI
    const payload = { ...tx, chainId, detectedAction: action };

    try {
        // Request user action from popup
        const response = await requestFromBackground(payload);
        console.log('[Magnee] Received response FULL:', JSON.stringify(response));

        switch (response.action) {
            case 'MAGNEEFY':
                console.log('[Magnee] Calling handleMagneefy with ID:', response.id);
                return handleMagneefy(tx, response.route, originalArgs, requestFn, response.id);

            case 'REJECT':
                throw new Error('User rejected transaction via Magnee');

            case 'FORWARD':
            default:
                return handleForward(tx, originalArgs, requestFn);
        }
    } catch (error: any) {
        // If error from background, forward original
        if (error.message?.includes('error from UI')) {
            console.error('[Magnee] Error from UI:', error);
            return requestFn(originalArgs);
        }
        throw error;
    }
}

/**
 * Handle direct execution requests (bypass interception)
 */
export async function handleDirectExecution(
    tx: any,
    chainId: number | undefined,
    requestFn: RequestFn
): Promise<string> {
    console.log('[Magnee] Received direct execution request:', tx);

    // Switch chain if needed
    if (chainId) {
        await ensureChain(requestFn, chainId);
    }

    // Execute transaction
    console.log('[Magnee] Calling originalRequest (bypass)...');
    const hash = await requestFn({
        method: 'eth_sendTransaction',
        params: [tx]
    });
    console.log('[Magnee] Bypass Tx Success! Hash:', hash);
    return hash;
}

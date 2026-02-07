/**
 * Transaction handling logic for Magnee interception
 * Handles MAGNEEFY, REJECT, and FORWARD actions
 */

import { createMagneefiedTx, buildWalletSendCalls, getCallsFromRoute, type Route } from '../magneeUtils';
import { ensureChain, getCodeDirect, sanitizeTx, type RequestFn } from './chainUtils';
import { requestFromBackground, type MagneeResponse } from './messaging';
import { getDelegateAddress } from '../../lib/delegates';

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
 * Execute batched transactions using ERC-5792 or sequential fallback
 */
async function executeBatchedTx(
    tx: any,
    route: Route,
    requestFn: RequestFn
): Promise<string> {
    // Try ERC-5792 wallet_sendCalls first
    const sendCallsRequest = buildWalletSendCalls(tx.from, route.chainId, route);
    if (sendCallsRequest) {
        try {
            console.log('[Magnee] Sending wallet_sendCalls:', sendCallsRequest);
            const result = await requestFn(sendCallsRequest);
            console.log('[Magnee] wallet_sendCalls result:', result);
            return result;
        } catch (erc5792Err: any) {
            console.log('[Magnee] wallet_sendCalls not supported:', erc5792Err?.message);
        }
    }

    // Fallback: Sequential transactions
    console.log('[Magnee] Falling back to sequential transactions...');
    const calls = getCallsFromRoute(route);
    let lastHash: string = '';

    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const isLast = i === calls.length - 1;

        console.log(`[Magnee] Sending tx ${i + 1}/${calls.length}:`, call);
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
        console.log(`[Magnee] Tx ${i + 1} sent! Hash:`, txHash);
        lastHash = txHash;

        // Wait for confirmation before next tx (except last)
        if (!isLast) {
            console.log('[Magnee] Waiting for confirmation...');
            await waitForTxConfirmation(requestFn, txHash);
        }
    }

    return lastHash;
}

/**
 * Ensure delegation state is correct before executing cross-chain tx.
 * - Source chain: revoke delegation if non-zero (prevents wallet_sendCalls conflicts)
 * - Destination chain: set MagneeDelegateAccount if not already delegated
 */
async function ensureDelegations(
    fromAddress: string,
    sourceChainId: number,
    destChainId: number,
    requestFn: RequestFn
): Promise<void> {
    // 1. Check source chain: revoke if has any delegation
    const sourceCode = await getCodeDirect(fromAddress, sourceChainId);
    if (sourceCode && sourceCode !== '0x') {
        console.log('[Magnee] Source chain has delegation, revoking to 0x0...');
        await ensureChain(requestFn, sourceChainId);
        await requestFn({
            method: 'eth_sendTransaction',
            params: [{
                from: fromAddress,
                to: fromAddress,
                value: '0x0',
                data: '0x',
                type: '0x04',
                authorizationList: [{
                    address: '0x0000000000000000000000000000000000000000',
                    chainId: `0x${sourceChainId.toString(16)}`
                }]
            }]
        });
        console.log('[Magnee] Source delegation revoked ✅');
    } else {
        console.log('[Magnee] Source chain clean (no delegation)');
    }

    // 2. Check destination chain: set our delegate if not present
    const destDelegate = getDelegateAddress(destChainId);
    if (!destDelegate) {
        console.log(`[Magnee] No delegate deployed for dest chain ${destChainId}, skipping`);
        return;
    }

    const destCode = await getCodeDirect(fromAddress, destChainId);
    const hasOurDelegate = destCode?.toLowerCase().includes(
        destDelegate.slice(2).toLowerCase()
    );

    if (!hasOurDelegate) {
        console.log(`[Magnee] Destination needs delegation to ${destDelegate}, setting...`);
        await ensureChain(requestFn, destChainId);
        await requestFn({
            method: 'eth_sendTransaction',
            params: [{
                from: fromAddress,
                to: fromAddress,
                value: '0x0',
                data: '0x',
                type: '0x04',
                authorizationList: [{
                    address: destDelegate,
                    chainId: `0x${destChainId.toString(16)}`
                }]
            }]
        });
        console.log('[Magnee] Destination delegation set ✅');
    } else {
        console.log('[Magnee] Destination already has our delegation ✅');
    }
}

/**
 * Handle MAGNEEFY action - execute the modified transaction
 */
async function handleMagneefy(
    tx: any,
    route: Route | undefined,
    originalArgs: any,
    requestFn: RequestFn
): Promise<string> {
    console.log('[Magnee] User chose to Magneefy!');

    // Switch to target chain if needed
    // NOTE: Delegation management is handled in the popup via wallet bridge
    // to avoid Chain Switch Wars (Aave etc. revert wallet_switchEthereumChain)
    if (route?.chainId) {
        await ensureChain(requestFn, route.chainId);
    }

    const newTx = createMagneefiedTx(tx, route);
    console.log('[Magnee] Rewritten Tx:', newTx);

    // Check if batching is required
    if (newTx._requiresBatching && route) {
        return executeBatchedTx(tx, route, requestFn);
    }

    // Single transaction
    return requestFn({
        method: 'eth_sendTransaction',
        params: [newTx]
    });
}

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
 * Main handler for payable transactions
 * Shows Magnee popup and handles user response
 */
export async function handlePayableTransaction(
    tx: any,
    chainId: number,
    originalArgs: any,
    requestFn: RequestFn
): Promise<string> {
    console.log('[Magnee] Found payable transaction:', tx);

    // Enrich tx with chain ID for UI
    const payload = { ...tx, chainId };

    try {
        // Request user action from popup
        const response = await requestFromBackground(payload);
        console.log('[Magnee] Received response:', response);

        switch (response.action) {
            case 'MAGNEEFY':
                return handleMagneefy(tx, response.route, originalArgs, requestFn);

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

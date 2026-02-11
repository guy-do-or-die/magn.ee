/**
 * Generic Action Detector (Fallback)
 * 
 * Handles unknown function selectors by looking up the 4byte.directory API.
 * Always returns shouldIntercept: true — the user can choose to forward
 * if the interception doesn't make sense for this particular call.
 * 
 * Uses the same lookup pattern as web/src/lib/explorer.ts.
 */

import type { DetectedAction, RawTx } from './types';

// ── 4byte.directory cache ───────────────────────────────────────────────

const selectorCache = new Map<string, string>();

async function lookup4byte(selector: string): Promise<string> {
    if (selectorCache.has(selector)) return selectorCache.get(selector)!;

    try {
        const res = await fetch(
            `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`
        );
        const data = await res.json();
        const results = data?.results as { text_signature: string }[];
        if (results?.length) {
            const name = results[0]!.text_signature.split('(')[0]!;
            selectorCache.set(selector, name);
            return name;
        }
    } catch {
        // API unavailable — use raw selector
    }

    selectorCache.set(selector, selector);
    return selector;
}

// ── Generic Detection ───────────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export async function detectGeneric(tx: RawTx): Promise<DetectedAction> {
    const hasData = tx.data && tx.data !== '0x' && tx.data.length > 2;
    const nativeValue = BigInt(tx.value || '0');
    const hasValue = nativeValue > 0n;

    // Pure ETH transfer (no data)
    if (!hasData) {
        return {
            type: 'ETH Transfer',
            shouldIntercept: hasValue,
            tokenAddress: ZERO_ADDRESS,
            tokenAmount: `0x${nativeValue.toString(16)}`,
            description: `Send ${nativeValue} wei`,
            originalCalldata: tx.data || '0x',
        };
    }

    // Contract call with value (payable function — current behavior)
    if (hasValue) {
        const selector = tx.data.slice(0, 10);
        const name = await lookup4byte(selector);
        return {
            type: `Payable Call: ${name}`,
            shouldIntercept: true,
            tokenAddress: ZERO_ADDRESS,
            tokenAmount: `0x${nativeValue.toString(16)}`,
            description: `${name}() + ${nativeValue} wei`,
            originalCalldata: tx.data,
        };
    }

    // Contract call without value — no assets being sent, skip interception
    // (withdraw, ENS text records, governance votes, etc.)
    const selector = tx.data.slice(0, 10);
    const name = await lookup4byte(selector);
    return {
        type: `Contract Call: ${name}`,
        shouldIntercept: false,
        tokenAddress: tx.to,
        tokenAmount: '0x0',
        description: `${name}()`,
        originalCalldata: tx.data,
    };
}

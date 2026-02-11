/**
 * Action Detector Registry
 * 
 * Entry point for transaction calldata analysis.
 * Iterates through registered detectors in priority order,
 * falls back to generic 4byte.directory lookup for unknown selectors.
 * 
 * To add a new action type:
 *   1. Create a new file in this directory implementing ActionDetector
 *   2. Import it here
 *   3. Add it to the `detectors` array
 */

import { decodeFunctionData } from 'viem';
import type { ActionDetector, DetectedAction, RawTx } from './types';

// ── Detector Imports ────────────────────────────────────────────────────

import { erc20Approval } from './erc20Approval';
import { erc20Transfer } from './erc20Transfer';
import { aaveSupply } from './aaveSupply';
import { detectGeneric } from './generic';

// ── Registry (order matters: first match wins) ──────────────────────────

const detectors: ActionDetector[] = [
    erc20Approval,   // skip-cases first
    erc20Transfer,
    aaveSupply,
    // Add new detectors here ↑
];

// ── Detection ───────────────────────────────────────────────────────────

/**
 * Analyze a raw transaction and return a DetectedAction.
 * 
 * 1. If tx has no calldata → ETH transfer (generic handler)
 * 2. Try each registered detector's ABI against the calldata
 * 3. If no detector matches → fall back to generic (4byte.directory)
 */
export async function detectAction(tx: RawTx): Promise<DetectedAction> {
    const hasData = tx.data && tx.data !== '0x' && tx.data.length > 2;

    // No calldata → skip registered detectors, go straight to generic
    if (!hasData) {
        return detectGeneric(tx);
    }

    // Try each registered detector
    for (const detector of detectors) {
        try {
            const { functionName, args } = decodeFunctionData({
                abi: detector.abi,
                data: tx.data as `0x${string}`,
            });

            const result = detector.analyze(functionName, args ?? [], tx);
            if (result) {
                console.log(`[Magnee] Action detected by ${detector.name}:`, result.type);
                return result;
            }
        } catch {
            // Selector didn't match this detector's ABI — try next
        }
    }

    // No registered detector matched → generic fallback
    console.log('[Magnee] No specific detector matched, using generic fallback');
    return detectGeneric(tx);
}

// ── Re-exports ──────────────────────────────────────────────────────────

export type { DetectedAction, ActionDetector, RawTx } from './types';

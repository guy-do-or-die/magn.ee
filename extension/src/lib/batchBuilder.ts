/**
 * Batch Builder
 * 
 * Constructs the re-entrant self-call batch for destination chain execution.
 * Uses the pattern: executeWithSignature(target=EOA, data=execute([calls]))
 * 
 * This requires NO contract changes — the existing MagneeDelegateAccount
 * supports this pattern natively:
 *   executeWithSignature → _execute(EOA, execute(calls)) → self-call
 *   → execute() passes msg.sender == address(this) → runs batch
 */

import { encodeFunctionData, parseAbi } from 'viem';
import { encodeBatchExecute, type Call } from './eip7702';
import type { DetectedAction } from './actions/types';

// ── Approval ABI ────────────────────────────────────────────────────────

const erc20ApproveAbi = parseAbi([
    'function approve(address spender, uint256 amount) returns (bool)',
]);

// ── Constants ───────────────────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Types ───────────────────────────────────────────────────────────────

export interface DestinationBatch {
    /** The outer call target — user's EOA for self-call, or direct target */
    outerTarget: string;
    /** Total ETH needed for the batch */
    outerValue: bigint;
    /** Encoded calldata (execute(calls) for batches, original data for single) */
    outerData: string;
    /** Individual calls in the batch (for UI display) */
    calls: Call[];
    /** Whether this is a batch (needs execute() wrapping) or single call */
    isBatch: boolean;
}

// ── Builder ─────────────────────────────────────────────────────────────

/**
 * Build the destination chain execution batch from a detected action.
 * 
 * For ERC-20 interactions that need approval:
 *   calls = [approve(spender, amount), originalCall]
 *   outerTarget = EOA (self-call triggers execute(calls))
 * 
 * For native ETH or no-approval calls:
 *   single call directly to the target
 */
export function buildDestinationBatch(
    userAddress: string,
    action: DetectedAction,
    originalTx: { to: string; value: string; data: string },
): DestinationBatch {
    const nativeValue = BigInt(originalTx.value || '0');
    const isNativeToken = action.tokenAddress === ZERO_ADDRESS
        || action.tokenAddress.toLowerCase() === ZERO_ADDRESS;
    const tokenAmount = BigInt(action.tokenAmount);
    const needsApproval = !isNativeToken && action.spender && tokenAmount > 0n;

    // ── Single call (no approval needed) ────────────────────────────
    if (!needsApproval) {
        const call: Call = {
            target: originalTx.to as `0x${string}`,
            value: nativeValue,
            data: (originalTx.data || '0x') as `0x${string}`,
        };

        return {
            outerTarget: originalTx.to,
            outerValue: nativeValue,
            outerData: originalTx.data || '0x',
            calls: [call],
            isBatch: false,
        };
    }

    // ── Batch: approve + original call ──────────────────────────────

    const approveData = encodeFunctionData({
        abi: erc20ApproveAbi,
        functionName: 'approve',
        args: [action.spender! as `0x${string}`, tokenAmount],
    });

    const approvCall: Call = {
        target: action.tokenAddress as `0x${string}`,
        value: 0n,
        data: approveData,
    };

    const actionCall: Call = {
        target: originalTx.to as `0x${string}`,
        value: nativeValue,
        data: (originalTx.data || '0x') as `0x${string}`,
    };

    const calls = [approvCall, actionCall];
    const batchData = encodeBatchExecute(calls);

    return {
        outerTarget: userAddress,    // self-call → triggers execute(calls)
        outerValue: nativeValue,     // ETH forwarded through the batch
        outerData: batchData,
        calls,
        isBatch: true,
    };
}

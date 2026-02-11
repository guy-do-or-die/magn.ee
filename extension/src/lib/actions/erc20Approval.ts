/**
 * ERC-20 Approval Detector
 * 
 * Recognizes approve(address,uint256) calls.
 * These should NOT be intercepted — they're preparatory steps,
 * not the actual DeFi action. The dApp will follow up with the real call.
 */

import { parseAbi, toHex } from 'viem';
import type { ActionDetector, DetectedAction, RawTx } from './types';

const abi = parseAbi([
    'function approve(address spender, uint256 amount) returns (bool)',
]);

export const erc20Approval: ActionDetector = {
    name: 'ERC-20 Approval',
    abi,

    analyze(functionName: string, args: readonly any[], tx: RawTx): DetectedAction | null {
        if (functionName !== 'approve') return null;

        const [spender, amount] = args as [string, bigint];
        return {
            type: 'ERC-20 Approval',
            shouldIntercept: false,  // Skip — dApp will send the real action next
            tokenAddress: tx.to,
            tokenAmount: toHex(amount),
            spender,
            description: `Approve ${spender} to spend tokens`,
            originalCalldata: tx.data,
        };
    },
};

/**
 * ERC-20 Transfer Detector
 * 
 * Recognizes transfer(address,uint256) calls on ERC-20 tokens.
 * The token contract is tx.to, amount is decoded from calldata.
 */

import { parseAbi, toHex } from 'viem';
import type { ActionDetector, DetectedAction, RawTx } from './types';

const abi = parseAbi([
    'function transfer(address to, uint256 amount) returns (bool)',
]);

export const erc20Transfer: ActionDetector = {
    name: 'ERC-20 Transfer',
    abi,

    analyze(functionName: string, args: readonly any[], tx: RawTx): DetectedAction | null {
        if (functionName !== 'transfer') return null;

        const [to, amount] = args as [string, bigint];
        return {
            type: 'ERC-20 Transfer',
            shouldIntercept: true,
            tokenAddress: tx.to,       // tx.to IS the token contract
            tokenAmount: toHex(amount),
            spender: to,               // recipient needs approval to receive via batch
            description: `Transfer tokens`,
            originalCalldata: tx.data,
        };
    },
};

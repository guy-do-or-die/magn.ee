/**
 * Action Detection Types
 * 
 * Shared interfaces for the pluggable action detector registry.
 * Each detector module implements ActionDetector to recognize specific
 * DeFi interactions from raw transaction calldata.
 */

import type { Abi } from 'viem';

// ── Raw Transaction ─────────────────────────────────────────────────────

/** Minimal transaction data needed for analysis */
export interface RawTx {
    to: string;
    value: string;
    data: string;
    from: string;
    chainId: number;
}

// ── Detected Action ─────────────────────────────────────────────────────

/** Result of analyzing a transaction's calldata */
export interface DetectedAction {
    /** Human-readable action type: "ERC-20 Transfer", "Aave Supply", etc. */
    type: string;

    /** Whether Magnee should intercept this tx (false for standalone approvals) */
    shouldIntercept: boolean;

    /** Token contract address involved (ZERO_ADDRESS for native ETH) */
    tokenAddress: string;

    /** Amount in token's smallest unit as hex string (viem convention, always serializable) */
    tokenAmount: string;

    /** If the destination batch needs an approval step, who gets approved */
    spender?: string;

    /** UI-friendly description: "Transfer 100 USDC to 0xabc..." */
    description: string;

    /** The original calldata to replay on the destination chain */
    originalCalldata: string;
}

// ── Action Detector ─────────────────────────────────────────────────────

/** 
 * A pluggable detector module.
 * 
 * Each detector declares an ABI fragment it can decode, and an analyze()
 * function that inspects the decoded args to produce a DetectedAction.
 * 
 * To add a new action type: create a file, implement this interface,
 * and register it in the detectors array in index.ts.
 */
export interface ActionDetector {
    /** Human-readable name for logging */
    name: string;

    /** ABI fragment(s) this detector handles — used with viem's decodeFunctionData */
    abi: Abi;

    /** 
     * Analyze decoded function args and raw tx to produce a DetectedAction.
     * Return null if this detector can't handle the decoded call.
     */
    analyze(functionName: string, args: readonly any[], tx: RawTx): DetectedAction | null;
}

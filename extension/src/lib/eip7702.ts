/**
 * EIP-7702 Signing Utilities
 * 
 * Provides utilities for creating and signing EIP-7702 authorization
 * and batch transactions using the MagneeDelegateAccount contract.
 */

import { encodeFunctionData, type Hex, type Address } from 'viem';
import { getDelegateAddress, supportsDelegation } from './delegates';
import { magneeDelegateAccountAbi } from '../generated';

// Re-export for convenience
export const DELEGATE_ABI = magneeDelegateAccountAbi;

export interface Call {
    target: Address;
    value: bigint;
    data: Hex;
}

/**
 * Encode a batch of calls for the MagneeDelegateAccount.execute function
 */
export function encodeBatchExecute(calls: Call[]): Hex {
    return encodeFunctionData({
        abi: magneeDelegateAccountAbi,
        functionName: 'execute',
        args: [calls.map(c => ({
            target: c.target,
            value: c.value,
            data: c.data
        }))]
    });
}

/**
 * Encode a single call for the MagneeDelegateAccount.executeSingle function
 */
export function encodeSingleExecute(call: Call): Hex {
    return encodeFunctionData({
        abi: magneeDelegateAccountAbi,
        functionName: 'executeSingle',
        args: [call.target, call.value, call.data]
    });
}

/**
 * Build a 7702 batch transaction request
 * 
 * The transaction calls the user's own address (which has delegated to MagneeDelegateAccount)
 * with the encoded execute() call.
 */
export function build7702Transaction(
    userAddress: Address,
    chainId: number,
    calls: Call[]
): {
    to: Address;
    data: Hex;
    value: bigint;
    chainId: number;
    delegateAddress: Address;
} | null {
    const delegateAddress = getDelegateAddress(chainId);
    if (!delegateAddress) {
        console.error(`[7702] No delegate deployed for chain ${chainId}`);
        return null;
    }

    // Calculate total value needed
    const totalValue = calls.reduce((sum, c) => sum + c.value, 0n);

    // Encode the batch call
    const data = calls.length === 1 
        ? encodeSingleExecute(calls[0])
        : encodeBatchExecute(calls);

    return {
        to: userAddress, // Call goes to user's address (delegated)
        data,
        value: totalValue,
        chainId,
        delegateAddress: delegateAddress as Address
    };
}

/**
 * Check if a chain supports 7702 delegation
 */
export { supportsDelegation };

/**
 * Type for 7702 authorization (matches viem's SignAuthorizationReturnType)
 */
export interface Authorization {
    contractAddress: Address;
    chainId: number;
    nonce: bigint;
    r: Hex;
    s: Hex;
    v: bigint;
    yParity: number;
}

/**
 * Build the full 7702 transaction including authorization
 * 
 * Note: The actual signing must be done by the wallet (e.g., via eth_sendTransaction 
 * with type: 0x04 and authorizationList)
 */
export function build7702Request(
    userAddress: Address,
    chainId: number,
    calls: Call[]
): {
    type: '0x04';
    to: Address;
    data: Hex;
    value: string; // hex string
    chainId: string; // hex string
    authorizationList: Array<{
        contractAddress: Address;
        chainId: string; // hex string
    }>;
} | null {
    const tx = build7702Transaction(userAddress, chainId, calls);
    if (!tx) return null;

    return {
        type: '0x04',
        to: tx.to,
        data: tx.data,
        value: `0x${tx.value.toString(16)}`,
        chainId: `0x${chainId.toString(16)}`,
        authorizationList: [{
            contractAddress: tx.delegateAddress,
            chainId: `0x${chainId.toString(16)}`
        }]
    };
}

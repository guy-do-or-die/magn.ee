/**
 * Deployed MagneeDelegateAccount addresses for EIP-7702 flow
 * 
 * These contracts allow EOAs to batch transactions while preserving msg.sender.
 * User signs 7702 authorization → EOA temporarily adopts contract code → execute batch
 * 
 * Addresses are loaded from delegates.json (source of truth for deployments)
 */

import delegateAddresses from './delegates.json';

export const MAGNEE_DELEGATES = delegateAddresses as Record<string, string>;

export type SupportedDelegateChainId = keyof typeof MAGNEE_DELEGATES;

export function getDelegateAddress(chainId: number): string | undefined {
    return MAGNEE_DELEGATES[chainId.toString()];
}

export function supportsDelegation(chainId: number): boolean {
    return chainId.toString() in MAGNEE_DELEGATES;
}

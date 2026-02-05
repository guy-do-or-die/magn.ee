// Magnee Router Address (Anvil Deployment)
export const ROUTER_ADDRESS = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';

import { getDelegateAddress, supportsDelegation } from '../lib/delegates';
import { encodeBatchExecute, type Call } from '../lib/eip7702';

export interface Route {
    id: string;
    title: string;
    tokenIn: string;
    amountIn: string;
    tokenOut: string;
    chainId: number;
    strategy: string; // Identifier for the logic (e.g. 'EXECUTE_ROUTE')
    calldata?: string; // The FULLY ENCODED calldata for the router function
    // Metadata for debugging/UI
    targetAddress?: string;
    targetData?: string;
    auxData?: string;
    txValue?: string; // The correct HEX value for the 'value' field of the tx
    amountUSD?: string; // For Safety Check
    // 7702 specific
    approvalTx?: {
        to: string;
        data: string;
    };
}

/**
 * ERC-5792 Call structure for wallet_sendCalls
 */
export interface ERC5792Call {
    to: string;
    value?: string; // hex
    data?: string; // hex
}

/**
 * Build ERC-5792 wallet_sendCalls request
 * This is the wallet-agnostic way to batch transactions.
 * The wallet decides whether to use 7702, 4337, or native batching.
 */
export function buildWalletSendCalls(
    fromAddress: string,
    chainId: number,
    route: Route
): { method: string; params: any[] } | null {
    const calls: ERC5792Call[] = [];
    
    // Add approval call if present
    if (route.approvalTx) {
        calls.push({
            to: route.approvalTx.to,
            value: '0x0',
            data: route.approvalTx.data
        });
        console.log('[Magnee Utils] ERC-5792: Added approval call');
    }
    
    // Add main bridge/swap call
    if (route.calldata && route.targetAddress) {
        calls.push({
            to: route.targetAddress,
            value: route.txValue || '0x0',
            data: route.calldata
        });
        console.log('[Magnee Utils] ERC-5792: Added main call');
    }
    
    if (calls.length === 0) {
        console.log('[Magnee Utils] ERC-5792: No calls to batch');
        return null;
    }
    
    console.log('[Magnee Utils] ERC-5792: Building wallet_sendCalls with', calls.length, 'calls');
    
    return {
        method: 'wallet_sendCalls',
        params: [{
            version: '1.0',
            chainId: `0x${chainId.toString(16)}`,
            from: fromAddress,
            calls: calls,
            capabilities: {
                // Request atomic execution if possible
                atomicBatch: {
                    supported: true
                }
            }
        }]
    };
}

/**
 * Check if wallet supports ERC-5792 capabilities
 */
export function buildGetCapabilities(fromAddress: string): { method: string; params: any[] } {
    return {
        method: 'wallet_getCapabilities',
        params: [fromAddress]
    };
}

/**
 * Create a 7702 batch transaction (approval + main call)
 * Returns null if 7702 not supported on this chain
 * 
 * NOTE: This is a FALLBACK approach. ERC-5792 wallet_sendCalls is preferred
 * because it lets the wallet decide how to batch, avoiding security warnings.
 */
export function create7702BatchTx(originalTx: any, route: Route): any | null {
    const chainId = route.chainId;
    
    if (!supportsDelegation(chainId)) {
        console.log('[Magnee Utils] Chain does not support 7702:', chainId);
        return null;
    }
    
    const delegateAddress = getDelegateAddress(chainId);
    if (!delegateAddress) {
        console.log('[Magnee Utils] No delegate address for chain:', chainId);
        return null;
    }
    
    const calls: Call[] = [];
    
    // Add approval call if present
    if (route.approvalTx) {
        calls.push({
            target: route.approvalTx.to as `0x${string}`,
            value: 0n,
            data: route.approvalTx.data as `0x${string}`
        });
        console.log('[Magnee Utils] Added approval call to batch');
    }
    
    // Add main bridge/swap call
    if (route.calldata && route.targetAddress) {
        const value = route.txValue ? BigInt(route.txValue) : 0n;
        calls.push({
            target: route.targetAddress as `0x${string}`,
            value,
            data: route.calldata as `0x${string}`
        });
        console.log('[Magnee Utils] Added main call to batch');
    }
    
    if (calls.length === 0) {
        console.log('[Magnee Utils] No calls to batch');
        return null;
    }
    
    // Encode the batch execute call
    const batchData = encodeBatchExecute(calls);
    
    // Calculate total value
    const totalValue = calls.reduce((sum, c) => sum + c.value, 0n);
    
    console.log('[Magnee Utils] Creating 7702 batch tx:', {
        callCount: calls.length,
        totalValue: totalValue.toString(),
        delegateAddress
    });
    
    // 7702 transaction - goes to user's address (not delegate!)
    // The authorizationList tells the wallet to delegate to our contract
    return {
        from: originalTx.from,
        to: originalTx.from, // Self-call (user's address with delegated code)
        value: `0x${totalValue.toString(16)}`,
        data: batchData,
        // EIP-7702 specific fields
        type: '0x04', // EIP-7702 transaction type
        authorizationList: [{
            address: delegateAddress, // Per EIP-7702 spec: use 'address' not 'contractAddress'
            chainId: `0x${chainId.toString(16)}`
        }]
    };
}

/**
 * Constructs the full Magneefied transaction
 * Priority: ERC-5792 > 7702 > standard single tx
 */
export function createMagneefiedTx(originalTx: any, route?: Route): any {
    console.log('[Magnee Utils] DEBUG: Route Object:', JSON.stringify(route));
    console.log('[Magnee Utils] DEBUG: Strategy Check:', route?.strategy);
    console.log('[Magnee Utils] DEBUG: Calldata length:', route?.calldata?.length);

    if (route && (route.strategy === 'EXECUTE_ROUTE' || route.strategy === 'LIFI_BRIDGE') && route.calldata) {
        // If there's an approval tx, we need batching
        // Flag this for the caller to know we need ERC-5792 or 7702
        if (route.approvalTx) {
            console.log('[Magnee Utils] Route has approval tx - batching required');
            // Return special marker for the caller to use ERC-5792
            return {
                _requiresBatching: true,
                _route: route,
                _originalTx: originalTx
            };
        }
        
        // No approval needed - just use standard Li.Fi transaction
        const toAddress = route.strategy === 'LIFI_BRIDGE' ? route.targetAddress : ROUTER_ADDRESS;

        return {
            from: originalTx.from,
            to: toAddress,
            value: route.txValue || route.amountIn,
            data: route.calldata,
            gas: originalTx.gas,
            maxFeePerGas: originalTx.maxFeePerGas,
            maxPriorityFeePerGas: originalTx.maxPriorityFeePerGas,
            nonce: originalTx.nonce
        };
    }

    // Fallback or "FORWARD" legacy strategy (if used)
    return originalTx;
}

/**
 * Get the calls array for ERC-5792 or sequential execution
 */
export function getCallsFromRoute(route: Route): ERC5792Call[] {
    const calls: ERC5792Call[] = [];
    
    if (route.approvalTx) {
        calls.push({
            to: route.approvalTx.to,
            value: '0x0',
            data: route.approvalTx.data
        });
    }
    
    if (route.calldata && route.targetAddress) {
        calls.push({
            to: route.targetAddress,
            value: route.txValue || '0x0',
            data: route.calldata
        });
    }
    
    return calls;
}

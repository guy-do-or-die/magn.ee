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
 * Create a 7702 batch transaction (approval + main call)
 * Returns null if 7702 not supported on this chain
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
            contractAddress: delegateAddress,
            chainId: `0x${chainId.toString(16)}`
        }]
    };
}

/**
 * Constructs the full Magneefied transaction
 * Tries 7702 first, falls back to standard tx
 */
export function createMagneefiedTx(originalTx: any, route?: Route): any {
    console.log('[Magnee Utils] DEBUG: Route Object:', JSON.stringify(route));
    console.log('[Magnee Utils] DEBUG: Strategy Check:', route?.strategy);
    console.log('[Magnee Utils] DEBUG: Calldata length:', route?.calldata?.length);

    if (route && (route.strategy === 'EXECUTE_ROUTE' || route.strategy === 'LIFI_BRIDGE') && route.calldata) {
        // Try 7702 batch first (if approval is needed or chain supports it)
        if (route.approvalTx || supportsDelegation(route.chainId)) {
            const tx7702 = create7702BatchTx(originalTx, route);
            if (tx7702) {
                console.log('[Magnee Utils] Using 7702 batch transaction');
                return tx7702;
            }
        }
        
        // Fallback to standard Li.Fi transaction
        // For LIFI_BRIDGE, route.targetAddress SHOULD be the Li.Fi Router (quote.to)
        // For EXECUTE_ROUTE, it might be our Router address hardcoded
        const toAddress = route.strategy === 'LIFI_BRIDGE' ? route.targetAddress : ROUTER_ADDRESS;

        return {
            from: originalTx.from,
            to: toAddress,
            // Use correct native value from the quote (route.txValue). 
            // Fallback to route.amountIn ONLY for legacy reasons, but really for ERC20 swaps this should be 0 (or hex '0x0')
            value: route.txValue || route.amountIn,
            data: route.calldata, // The fully encoded router/bridge call

            // Gas fields: Keep original or let wallet estimate
            gas: originalTx.gas,
            maxFeePerGas: originalTx.maxFeePerGas,
            maxPriorityFeePerGas: originalTx.maxPriorityFeePerGas,
            nonce: originalTx.nonce
        };
    }

    // Fallback or "FORWARD" legacy strategy (if used)
    return originalTx;
}


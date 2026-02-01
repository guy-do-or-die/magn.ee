// Magnee Router Address (Anvil Deployment)
export const ROUTER_ADDRESS = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
export const MOCK_USDC_ADDRESS = '0x0165878A594ca255338adfa4d48449f69242Eb8F';

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
}

/**
 * Constructs the full Magneefied transaction
 */
export function createMagneefiedTx(originalTx: any, route?: Route): any {
    console.log('[Magnee Utils] DEBUG: Route Object:', JSON.stringify(route));
    console.log('[Magnee Utils] DEBUG: Strategy Check:', route?.strategy);
    console.log('[Magnee Utils] DEBUG: Calldata length:', route?.calldata?.length);

    if (route && (route.strategy === 'EXECUTE_ROUTE' || route.strategy === 'LIFI_BRIDGE') && route.calldata) {
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

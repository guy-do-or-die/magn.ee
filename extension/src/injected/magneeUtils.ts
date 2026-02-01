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
}

/**
 * Constructs the full Magneefied transaction
 */
export function createMagneefiedTx(originalTx: any, route?: Route): any {
    if (route && route.strategy === 'EXECUTE_ROUTE' && route.calldata) {
        return {
            from: originalTx.from,
            to: ROUTER_ADDRESS, // The Router
            // Use route.amountIn if specified, otherwise keep original value?
            // Usually we PAY the router `amountIn`. 
            // If tokenIn is ETH (0), amountIn is msg.value.
            value: route.amountIn,
            data: route.calldata, // The fully encoded router call from App.tsx

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

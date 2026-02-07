/**
 * Chain switching and cross-chain read utilities
 * Single source of truth for chain-related operations
 */

export type RequestFn = (args: { method: string; params?: any[] }) => Promise<any>;

/** Public RPC endpoints for direct cross-chain reads (no chain switch needed) */
const RPC_URLS: Record<number, string> = {
    1:     'https://eth.llamarpc.com',
    8453:  'https://mainnet.base.org',
    42161: 'https://arb1.arbitrum.io/rpc',
    10:    'https://mainnet.optimism.io',
};

/**
 * Read eth_getCode via direct HTTP RPC (no wallet interaction, no chain switch)
 */
export async function getCodeDirect(address: string, chainId: number): Promise<string> {
    const rpc = RPC_URLS[chainId];
    if (!rpc) {
        console.warn(`[Magnee] No RPC for chain ${chainId}, skipping code check`);
        return '0x';
    }
    try {
        const res = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1,
                method: 'eth_getCode',
                params: [address, 'latest']
            })
        });
        const data = await res.json();
        return data.result || '0x';
    } catch (err) {
        console.warn(`[Magnee] getCode RPC failed for chain ${chainId}:`, err);
        return '0x';
    }
}

/**
 * Ensure wallet is on the target chain, switching if necessary
 */
export async function ensureChain(
    requestFn: RequestFn,
    targetChainId: number
): Promise<boolean> {
    try {
        const currentChainIdHex = await requestFn({ method: 'eth_chainId' });
        const currentChainId = parseInt(currentChainIdHex, 16);
        console.log(`[Magnee] Chain Check. Current: ${currentChainId}, Target: ${targetChainId}`);

        if (currentChainId !== targetChainId) {
            console.log(`[Magnee] Switching to ${targetChainId}...`);
            try {
                await requestFn({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: `0x${targetChainId.toString(16)}` }]
                });
                console.log('[Magnee] Switch requested. Waiting 1s...');
                await new Promise(r => setTimeout(r, 1000));
                return true;
            } catch (switchErr: any) {
                console.error('[Magnee] Switch failed:', switchErr);
                if (switchErr.code === 4902) {
                    alert(`Magnee: Chain ID ${targetChainId} not found. Add it manually.`);
                } else {
                    alert(`Magnee: Auto-switch to ${targetChainId} failed. Please switch manually.`);
                }
                return false;
            }
        }
        return true; // Already on correct chain
    } catch (err) {
        console.error('[Magnee] Chain check error:', err);
        return false;
    }
}

/**
 * Get current chain ID
 */
export async function getCurrentChainId(requestFn: RequestFn): Promise<number> {
    const chainIdHex = await requestFn({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
}

/**
 * Convert value to hex string for RPC compliance
 */
export function toHex(val: any): string | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'bigint') return `0x${val.toString(16)}`;
    if (typeof val === 'number') return `0x${val.toString(16)}`;
    return val; // Assume string is already hex
}

/**
 * Sanitize transaction object for RPC compliance
 */
export function sanitizeTx(tx: any): Record<string, any> {
    const safeTx: Record<string, any> = {
        from: tx.from,
        to: tx.to,
        value: toHex(tx.value),
        data: tx.data,
        gas: toHex(tx.gas),
        gasPrice: toHex(tx.gasPrice),
        maxFeePerGas: toHex(tx.maxFeePerGas),
        maxPriorityFeePerGas: toHex(tx.maxPriorityFeePerGas),
        nonce: toHex(tx.nonce)
    };

    // Strip undefined keys
    Object.keys(safeTx).forEach(key => {
        if (safeTx[key] === undefined) delete safeTx[key];
    });

    return safeTx;
}

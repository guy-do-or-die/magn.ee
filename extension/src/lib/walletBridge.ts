/**
 * Wallet Bridge
 * 
 * Routes wallet RPC calls through the service worker, which uses
 * chrome.scripting.executeScript to call window.ethereum in the dapp tab.
 * 
 */

// Type for RPC call result
interface WalletResult<T = any> {
    ok: boolean;
    result?: T;
    error?: string;
}

// Store reqId for routing to the correct tab via service worker
let _currentReqId: string | null = null;

export function setCurrentReqId(reqId: string) {
    _currentReqId = reqId;
}

/**
 * Execute an RPC method on the wallet via service worker relay
 */
export async function walletRequest<T = any>(
    method: string,
    params?: any[]
): Promise<WalletResult<T>> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'WALLET_RPC',
            payload: { method, params: params ?? [], reqId: _currentReqId }
        }, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
                return;
            }
            resolve(response ?? { ok: false, error: 'No response from service worker' });
        });
    });
}

/**
 * Request accounts from wallet (triggers connect popup)
 */
export async function requestAccounts(): Promise<WalletResult<string[]>> {
    return walletRequest<string[]>('eth_requestAccounts');
}

/**
 * Get connected accounts (doesn't prompt if not connected)
 */
export async function getAccounts(): Promise<WalletResult<string[]>> {
    return walletRequest<string[]>('eth_accounts');
}

/**
 * Get current chain ID
 */
export async function getChainId(): Promise<WalletResult<string>> {
    return walletRequest<string>('eth_chainId');
}

/**
 * Send a transaction
 */
export async function sendTransaction(tx: {
    from: string;
    to: string;
    value?: string;
    data?: string;
    gas?: string;
}): Promise<WalletResult<string>> {
    return walletRequest<string>('eth_sendTransaction', [tx]);
}

/**
 * Switch to a different chain
 */
export async function switchChain(chainId: number): Promise<WalletResult<null>> {
    return walletRequest<null>('wallet_switchEthereumChain', [
        { chainId: `0x${chainId.toString(16)}` }
    ]);
}

/**
 * Sign EIP-712 typed data for MagneeDelegateAccount.executeWithSignature()
 * 
 * This produces a signature that authorizes a specific execution on the
 * destination chain, verified on-chain by the delegate contract.
 */
export async function signExecuteTypedData(params: {
    /** Signer address (the EOA) */
    from: string;
    /** Destination chain ID where the call will execute */
    chainId: number;
    /** verifyingContract = the EOA address (which has delegated code) */
    verifyingContract: string;
    /** Target contract to call */
    target: string;
    /** ETH value to send */
    value: string;
    /** Calldata for the target */
    data: string;
    /** Unique nonce */
    nonce: string;
    /** Unix timestamp deadline */
    deadline: string;
}): Promise<WalletResult<string>> {
    const typedData = {
        types: {
            EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
            ],
            Execute: [
                { name: 'target', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'data', type: 'bytes' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
            ],
        },
        primaryType: 'Execute',
        domain: {
            name: 'MagneeDelegateAccount',
            version: '1',
            chainId: params.chainId,
            verifyingContract: params.verifyingContract,
        },
        message: {
            target: params.target,
            value: params.value,
            data: params.data,
            nonce: params.nonce,
            deadline: params.deadline,
        },
    };

    return walletRequest<string>('eth_signTypedData_v4', [
        params.from,
        JSON.stringify(typedData)
    ]);
}

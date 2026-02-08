/**
 * Li.Fi SDK Integration - Global config pattern
 * 
 * Uses @lifi/sdk with createConfig() for global setup.
 * Action functions read from global config automatically.
 */

import {
    createConfig,
    getContractCallsQuote,
    executeRoute,
    convertQuoteToRoute,
    getStatus,
    EVM,
} from '@lifi/sdk';
import type { 
    LiFiStep, 
    RouteExtended,
    ContractCallsQuoteRequest,
} from '@lifi/sdk';
import { createWalletClient, custom } from 'viem';
import { arbitrum, optimism, base, mainnet } from 'viem/chains';

// Chain lookup for viem
const chainMap: Record<number, any> = {
    1: mainnet,
    10: optimism,
    42161: arbitrum,
    8453: base,
};

// Track if SDK is initialized
let initialized = false;

/**
 * Initialize the Li.Fi SDK with a bridge provider (EIP-1193 compatible)
 * Creates a viem WalletClient that Li.Fi SDK needs (with account.address)
 * @param provider EIP-1193 compatible provider
 * @param sourceChainId Explicit chain ID to use (avoids async race after wallet_switchEthereumChain)
 */
export async function initLiFiSDK(provider: any, sourceChainId?: number) {
    console.log('[Magnee] initLiFiSDK called, provider.request:', typeof provider?.request, 'sourceChainId:', sourceChainId);
    
    // Get connected account from the provider
    const accounts = await provider.request({ method: 'eth_accounts' });
    const address = accounts?.[0];
    
    // Use explicit chainId if provided (wallet_switchEthereumChain is async, eth_chainId may be stale)
    let chainId: number;
    if (sourceChainId) {
        chainId = sourceChainId;
    } else {
        const chainIdHex = await provider.request({ method: 'eth_chainId' });
        chainId = parseInt(chainIdHex, 16);
    }
    
    console.log('[Magnee] Bridge provider - address:', address, 'chainId:', chainId);
    
    if (!address) {
        throw new Error('No connected account found via bridge provider');
    }

    // Track desired chain — isolated from the dapp's actual chain state
    let trackedChainId = chainId;

    // Helper to create a WalletClient for a specific chain
    // Intercepts eth_chainId to return OUR tracked chain (not the dapp's)
    // so Aave/etc. can't interfere with SDK's chain detection
    function makeClient(targetChainId: number) {
        const chain = chainMap[targetChainId] || {
            id: targetChainId,
            name: `Chain ${targetChainId}`,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [] } },
        };
        return createWalletClient({
            account: address as `0x${string}`,
            chain,
            transport: custom({
                async request({ method, params }: { method: string; params?: any[] }) {
                    // Override eth_chainId to return OUR tracked chain
                    // The dapp's window.ethereum may report a different chain
                    // (e.g., Aave fights back to Optimism after we switch to Arbitrum)
                    if (method === 'eth_chainId') {
                        return `0x${trackedChainId.toString(16)}`;
                    }
                    // wallet_switchEthereumChain — update OUR tracking only
                    // Don't send through dapp's window.ethereum (causes chain war)
                    if (method === 'wallet_switchEthereumChain') {
                        const reqHex = (params as any)?.[0]?.chainId;
                        if (reqHex) {
                            trackedChainId = parseInt(reqHex, 16);
                            console.log('[Magnee] Transport: tracked chain updated to', trackedChainId);
                        }
                        return null;
                    }
                    // All other methods go through normally
                    return provider.request({ method, params });
                }
            })
        });
    }

    // Track the current client — updated by switchChain
    let currentClient = makeClient(chainId);
    console.log('[Magnee] Created viem WalletClient:', currentClient.account.address);

    // Configure Li.Fi SDK with the viem WalletClient
    createConfig({
        integrator: 'Magnee',
        providers: [
            EVM({
                getWalletClient: async () => {
                    console.log('[Magnee] Li.Fi getWalletClient called, chain:', currentClient.chain.id);
                    return currentClient as any;
                },
                switchChain: async (reqChainId: number) => {
                    console.log('[Magnee] Li.Fi switchChain called:', reqChainId);
                    // Just update internal tracking — don't fight the dapp
                    trackedChainId = reqChainId;
                    currentClient = makeClient(reqChainId);
                    console.log('[Magnee] switchChain done, new client chain:', currentClient.chain.id);
                    return currentClient as any;
                }
            })
        ]
    });
    initialized = true;
    console.log('[Magnee] Li.Fi SDK initialized with viem WalletClient');
}

/**
 * Request params for our use case
 */
export interface LiFiQuoteRequest {
    fromChain: number;
    fromToken: string;
    fromAddress: string;
    toChain: number;
    toToken: string;
    toAmount: string;
    contractCalls: {
        fromAmount: string;
        fromTokenAddress: string;
        toContractAddress: string;
        toContractCallData: string;
        toContractGasLimit: string;
    }[];
    integrator?: string;
    slippage?: number; // 0-1 range (e.g. 0.005 = 0.5%), default 0.03
    gasLimitMultiplier?: number; // e.g. 1.2 = 120%
}

/**
 * Response structure (compatible with existing code)
 */
export interface LiFiQuoteResponse {
    transactionRequest: {
        data: string;
        to: string;
        value: string;
        gasLimit: string;
        gasPrice: string;
        chainId: number;
    };
    estimate: {
        fromAmount: string;
        fromAmountUSD?: string;
        toAmount: string;
        approvalAddress: string;
    };
    action: {
        fromToken: {
            address: string;
            symbol: string;
            decimals: number;
        };
        toToken: {
            address: string;
            symbol: string;
            decimals: number;
        };
    };
    // Keep raw step for SDK execution
    _step?: LiFiStep;
}

/**
 * Fetch a quote using the SDK (global config pattern - no client arg)
 */
export async function fetchLiFiQuote(params: LiFiQuoteRequest): Promise<LiFiQuoteResponse> {
    console.log('[Magnee] Li.Fi SDK Quote Request:', params);

    // Build SDK request
    const sdkRequest: ContractCallsQuoteRequest = {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAddress: params.fromAddress,
        toAmount: params.toAmount,
        contractCalls: params.contractCalls,
        integrator: params.integrator || 'Magnee',
        slippage: params.slippage ?? 0.03,  // User setting or 3% default
    } as ContractCallsQuoteRequest;

    // SDK functions use global config - no client arg needed
    const step = await getContractCallsQuote(sdkRequest);
    
    console.log('[Magnee] Li.Fi SDK Quote Result:', step);

    // Convert SDK response to our interface format
    return {
        transactionRequest: {
            data: step.transactionRequest?.data as string || '0x',
            to: step.transactionRequest?.to as string || '',
            value: step.transactionRequest?.value?.toString() || '0',
            gasLimit: step.transactionRequest?.gasLimit?.toString() || '0',
            gasPrice: step.transactionRequest?.gasPrice?.toString() || '0',
            chainId: step.transactionRequest?.chainId || params.fromChain,
        },
        estimate: {
            fromAmount: step.estimate.fromAmount,
            fromAmountUSD: step.estimate.fromAmountUSD,
            toAmount: step.estimate.toAmount,
            approvalAddress: step.estimate.approvalAddress || '',
        },
        action: {
            fromToken: {
                address: step.action.fromToken.address,
                symbol: step.action.fromToken.symbol,
                decimals: step.action.fromToken.decimals,
            },
            toToken: {
                address: step.action.toToken.address,
                symbol: step.action.toToken.symbol,
                decimals: step.action.toToken.decimals,
            },
        },
        _step: step,
    };
}

/**
 * Execution status callback type
 */
export type ExecutionUpdateCallback = (update: {
    step: number;
    total: number;
    status: 'pending' | 'in_progress' | 'done' | 'failed';
    message: string;
    substatus?: string;
}) => void;

/**
 * Execute a route with real-time status updates using SDK
 */
export async function executeLiFiRoute(
    step: LiFiStep,
    contractCalls?: any[],
    onUpdate?: ExecutionUpdateCallback
): Promise<RouteExtended> {
    console.log('[Magnee] executeLiFiRoute called');
    console.log('[Magnee] step.type:', step?.type);
    console.log('[Magnee] step.includedSteps:', step?.includedSteps?.length);
    console.log('[Magnee] step.includedSteps types:', step?.includedSteps?.map((s: any) => s.type));
    console.log('[Magnee] contractCalls provided:', contractCalls?.length);
    if (contractCalls?.length) {
        contractCalls.forEach((c: any, i: number) => {
            console.log(`[Magnee] contractCall[${i}]:`, {
                toContractAddress: c.toContractAddress,
                fromAmount: c.fromAmount,
                fromTokenAddress: c.fromTokenAddress,
                toContractGasLimit: c.toContractGasLimit,
                calldataLen: c.toContractCallData?.length,
            });
        });
    }
    
    const route = convertQuoteToRoute(step);
    console.log('[Magnee] Converted to route, steps:', route?.steps?.length);
    
    const executionOptions: any = {
        // Provide getContractCalls callback — SDK calls this to get destination contract calls
        getContractCalls: contractCalls?.length ? async () => {
            console.log('[Magnee] SDK getContractCalls called, returning', contractCalls.length, 'calls');
            return { contractCalls };
        } : undefined,
        updateRouteHook: (updatedRoute: RouteExtended) => {
            if (!onUpdate) return;

            // Find current executing step
            const currentStepIndex = updatedRoute.steps.findIndex(
                (s: any) => s.execution?.status !== 'DONE'
            );
            const steps = updatedRoute.steps;
            const currentStep = currentStepIndex >= 0 
                ? steps[currentStepIndex] 
                : steps[steps.length - 1];
            const execution = currentStep?.execution;

            if (execution) {
                const processes = execution.process || [];
                const lastProcess = processes[processes.length - 1];
                onUpdate({
                    step: currentStepIndex >= 0 ? currentStepIndex + 1 : updatedRoute.steps.length,
                    total: updatedRoute.steps.length,
                    status: mapExecutionStatus(execution.status),
                    message: lastProcess?.message || '',
                    substatus: lastProcess?.substatus,
                });
            }
        }
    };

    // SDK executeRoute uses global config
    console.log('[Magnee] Calling executeRoute...');
    return await executeRoute(route, executionOptions);
}

/**
 * Map SDK execution status to our simplified status
 */
function mapExecutionStatus(status: string): 'pending' | 'in_progress' | 'done' | 'failed' {
    switch (status) {
        case 'DONE':
            return 'done';
        case 'FAILED':
            return 'failed';
        case 'PENDING':
            return 'pending';
        default:
            return 'in_progress';
    }
}

/**
 * Get transaction status by hash using SDK
 */
export async function getLiFiTransactionStatus(
    txHash: string,
    fromChain: number,
    toChain: number
) {
    return await getStatus({
        txHash,
        fromChain,
        toChain,
    });
}

// Re-export types for convenience
export type { LiFiStep, RouteExtended };

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

// Track if SDK is initialized
let initialized = false;

/**
 * Initialize the Li.Fi SDK with the injected provider
 */
export function initLiFiSDK(provider: any) {
    if (initialized) return;

    createConfig({
        integrator: 'Magnee',
        providers: [
            EVM({
                getWalletClient: async () => provider,
                switchChain: async (chainId: number) => {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: `0x${chainId.toString(16)}` }]
                    });
                    return provider;
                }
            })
        ]
    });
    initialized = true;
    console.log('[Magnee] Li.Fi SDK initialized with global config');
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
    };

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
    onUpdate?: ExecutionUpdateCallback
): Promise<RouteExtended> {
    const route = convertQuoteToRoute(step);
    
    const executionOptions = {
        updateRouteHook: (updatedRoute: RouteExtended) => {
            if (!onUpdate) return;

            // Find current executing step
            const currentStepIndex = updatedRoute.steps.findIndex(
                s => s.execution?.status !== 'DONE'
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

export interface LiFiQuoteRequest {
    fromChain: number;
    fromToken: string;
    fromAddress: string;
    toChain: number;
    toToken: string;
    toAmount: string; // The amount the merchant NEEDS
    contractCalls: {
        fromAmount: string;
        fromTokenAddress: string;
        toContractAddress: string;
        toContractCallData: string;
        toContractGasLimit: string;
    }[];
    integrator: string; // Required by Li.Fi
}

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
        fromAmount: string; // What the user pays
        fromAmountUSD?: string; // USD value
        toAmount: string;
        approvalAddress: string; // If we need to approve tokens
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
}

const LIFI_API_URL = 'https://li.quest/v1';

export async function fetchLiFiQuote(params: LiFiQuoteRequest): Promise<LiFiQuoteResponse> {
    console.log('[Magnee] Li.Fi Request Payload:', JSON.stringify(params, null, 2));

    const response = await fetch(`${LIFI_API_URL}/quote/contractCalls`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Li.Fi Quote Failed');
    }

    return response.json();
}

// Mock Quote for Anvil/Dev
export function getMockQuote(originalTx: { to: string; value: string; data: string }): LiFiQuoteResponse {
    return {
        transactionRequest: {
            data: originalTx.data, // In real world this would be the Li.Fi router call
            to: originalTx.to,     // Real world: Li.Fi Diamond
            value: originalTx.value,
            gasLimit: '500000',
            gasPrice: '1000000000',
            chainId: 31337
        },
        estimate: {
            fromAmount: originalTx.value, // User pays same amount in mock
            toAmount: originalTx.value,
            approvalAddress: originalTx.to
        },
        action: {
            fromToken: {
                address: '0x0000000000000000000000000000000000000000',
                symbol: 'ETH',
                decimals: 18
            },
            toToken: {
                address: '0x0000000000000000000000000000000000000000',
                symbol: 'ETH',
                decimals: 18
            }
        }
    };
}

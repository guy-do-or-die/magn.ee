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

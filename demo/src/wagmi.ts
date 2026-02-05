import { http, createConfig } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'


export const config = createConfig({
    chains: [base, optimism, arbitrum],
    connectors: [injected()],
    transports: {
        [base.id]: http(),
        [optimism.id]: http(),
        [arbitrum.id]: http(),
    },
})

// Contract addresses
export const DEMO_ADDRESSES: Record<number, `0x${string}`> = {
    [base.id]: '0xf63fB71A13312344C5F27da32803338Da6a3DcEC',  // Base
    [optimism.id]: '0xf631B71A13312344C5F27da32803338Da6a3DcEC',    // Optimism
    [arbitrum.id]: '0xf631B71A13312344C5F27da32803338Da6a3DcEC'  // Arbitrum
}

// ABIs
export const ROUTER_ABI = [
    {
        type: 'function',
        name: 'forward',
        inputs: [
            { name: 'target', type: 'address' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [{ name: 'returnData', type: 'bytes' }],
        stateMutability: 'payable',
    },
    {
        type: 'event',
        name: 'MagneeCall',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'target', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false },
            { name: 'data', type: 'bytes', indexed: false },
        ],
    },
] as const

export const DEMO_ABI = [
    {
        type: 'function',
        name: 'donate',
        inputs: [{ name: 'message', type: 'string' }],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'totalDonations',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'donations',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'DonationReceived',
        inputs: [
            { name: 'from', type: 'address', indexed: true },
            { name: 'amount', type: 'uint256', indexed: false },
            { name: 'message', type: 'string', indexed: false },
        ],
    },
] as const

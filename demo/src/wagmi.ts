import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Anvil local chain
const anvil = {
    id: 31337,
    name: 'Anvil',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['http://localhost:8545'] },
    },
} as const

export const config = createConfig({
    chains: [anvil, mainnet],
    connectors: [injected()],
    transports: {
        [anvil.id]: http(),
        [mainnet.id]: http(),
    },
})

// Contract addresses (Anvil deployment)
// Contract addresses (Anvil deployment)
export const ROUTER_ADDRESS = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as const
export const DEMO_ADDRESS = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as const

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

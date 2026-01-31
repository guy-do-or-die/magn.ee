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
export const ROUTER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as const
export const DEMO_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as const

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

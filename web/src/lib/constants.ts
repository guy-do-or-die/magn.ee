import { type Chain } from 'viem'
import { mainnet, arbitrum, base, optimism } from 'viem/chains'
import type { Address } from 'viem'

// ── Supported Chains ──

export const SUPPORTED_CHAINS: Chain[] = [mainnet, arbitrum, base, optimism]

export interface ChainMeta {
  chain: Chain
  key: string
  icon: string
  aliases: string[]
}

export const CHAIN_META: ChainMeta[] = [
  { chain: mainnet, key: 'eth', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/ethereum.svg', aliases: ['eth', 'ethereum'] },
  { chain: arbitrum, key: 'arb', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/arbitrum.svg', aliases: ['arb', 'arbitrum'] },
  { chain: base, key: 'base', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/base.svg', aliases: ['base'] },
  { chain: optimism, key: 'opt', icon: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/optimism.svg', aliases: ['op', 'optimism'] },
]

export function resolveChain(nameOrId: string): Chain | undefined {
  const lower = nameOrId.toLowerCase()
  const meta = CHAIN_META.find(
    m => m.key === lower || m.aliases.includes(lower) || m.chain.id.toString() === nameOrId || m.chain.name.toLowerCase() === lower
  )
  return meta?.chain
}

export function getChainMeta(chainId: number): ChainMeta | undefined {
  return CHAIN_META.find(m => m.chain.id === chainId)
}

// ── Contract Addresses ──

export const USER_EOA: Address = '0xA9A1aD47CB9dF79F42B2dc30d9c527D6f42b6eeE'

export const DELEGATE_ADDRS: Record<number, Address> = {
  [optimism.id]: '0x3De7B85259519F95C4b0788e3f1c69A3546447fB',
  [base.id]: '0x1d114dA79B0c1102Dd14f1A67634F4130b471413',
  [arbitrum.id]: '0x21422c9F4E27Dff05158dA4242637dF483d77422',
}

export const PAYABLE_DEMO: Address = '0xf63fB71A13312344C5F27da32803338Da6a3DcEC'

// ── Explorer URLs ──

export function explorerUrl(chain: Chain): string {
  return chain.blockExplorers?.default?.url ?? ''
}

export function txUrl(chain: Chain, hash: string): string {
  return `${explorerUrl(chain)}/tx/${hash}`
}

export function addressUrl(chain: Chain, addr: string): string {
  return `${explorerUrl(chain)}/address/${addr}`
}

// ── Known Event Signatures ──
// keccak256("Executed(address,uint256,bool)") — emitted by MagneeDelegateAccount
export const EXECUTED_EVENT_TOPIC = '0x8d164b427e1fdbcdd4488310c98a30b974353972048528fdd1c459fe0961b2c7'

// ── Bridge Event Names (infra noise for filtering) ──

export const BRIDGE_EVENT_NAMES = new Set([
  'ComposeDelivered', 'AssetSwapped', 'LiFiTransferCompleted',
  'LiFiGenericSwapCompleted', 'OFTReceived', 'Packet',
])

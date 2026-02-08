import { createPublicClient, http, formatEther, formatUnits, type Chain, type Hex, type TransactionReceipt } from 'viem'
import { SUPPORTED_CHAINS, DELEGATE_ADDRS, USER_EOA, BRIDGE_EVENT_NAMES, EXECUTED_EVENT_TOPIC, resolveChain, txUrl, addressUrl } from './constants'

// ── Types ──

export interface TxAnalysis {
  source: SourceInfo
  bridge: BridgeInfo | null
  destination: DestinationInfo | null
  delegations: DelegationInfo[]
}

export interface SourceInfo {
  chain: Chain
  hash: string
  status: 'success' | 'reverted'
  from: string
  to: string | null
  gasUsed: string
  gasLimit: string
  gasPct: string
  value: string
  method: string
  nonce: number
  url: string
}

export interface BridgeInfo {
  status: string
  substatus: string
  tool: string
  sentAmount: string
  sentToken: string
  recvAmount: string
  recvToken: string
  destChain: Chain | null
  destTxHash: string | null
}

export interface DestinationInfo {
  chain: Chain
  hash: string
  status: 'success' | 'reverted'
  from: string
  to: string | null
  gasUsed: string
  url: string
  events: EventInfo[]
  delegateExecuted: boolean
  targetEvents: TargetEvent[]
}

export interface EventInfo {
  index: number
  name: string
  address: string
  addressUrl: string
  userInvolved: boolean
}

export interface TargetEvent {
  name: string
  address: string
  url: string
}

export interface DelegationInfo {
  chain: Chain
  status: 'delegated' | 'other' | 'none' | 'error'
  delegateAddress?: string
  message: string
}

// ── Client Factory ──

function clientFor(chain: Chain) {
  return createPublicClient({ chain, transport: http() })
}

// ── 4byte Lookup (public API) ──

const sigCache = new Map<string, string>([
  [EXECUTED_EVENT_TOPIC, 'Executed'],
])

async function lookup4byte(selector: string): Promise<string> {
  if (sigCache.has(selector)) return sigCache.get(selector)!
  try {
    const res = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`)
    const data = await res.json()
    const results = data?.results as { text_signature: string }[]
    if (results?.length) {
      const name = results[0]!.text_signature.split('(')[0]!
      sigCache.set(selector, name)
      return name
    }
  } catch { /* fallback */ }
  const short = selector.slice(0, 10)
  sigCache.set(selector, short)
  return short
}

async function lookupEvent(topic0: Hex): Promise<string> {
  if (sigCache.has(topic0)) return sigCache.get(topic0)!
  try {
    const res = await fetch(`https://www.4byte.directory/api/v1/event-signatures/?hex_signature=${topic0}`)
    const data = await res.json()
    const results = data?.results as { text_signature: string }[]
    if (results?.length) {
      const name = results[0]!.text_signature.split('(')[0]!
      sigCache.set(topic0, name)
      return name
    }
  } catch { /* fallback */ }
  const short = topic0.slice(0, 10)
  sigCache.set(topic0, short)
  return short
}

// ── Li.Fi Status ──

interface LiFiStatus {
  status: string
  substatus: string
  tool: string
  sending: { amount: string; token: { symbol: string; decimals: number } }
  receiving: { txHash?: string; chainId?: number; amount: string; token: { symbol: string; decimals: number } }
}

async function fetchLiFiStatus(txHash: string, fromChainId: number, toChainId?: number): Promise<LiFiStatus | null> {
  const params = new URLSearchParams({ txHash, fromChain: String(fromChainId) })
  if (toChainId) params.set('toChain', String(toChainId))
  try {
    const res = await fetch(`https://li.quest/v1/status?${params}`)
    return await res.json() as LiFiStatus
  } catch {
    return null
  }
}

// ── Delegation Check ──

async function checkDelegation(chain: Chain): Promise<DelegationInfo> {
  try {
    const client = clientFor(chain)
    const code = await client.getCode({ address: USER_EOA })
    if (!code || code === '0x') return { chain, status: 'none', message: 'No delegation' }
    const expected = DELEGATE_ADDRS[chain.id]
    if (expected && code.toLowerCase().includes(expected.slice(2).toLowerCase())) {
      return { chain, status: 'delegated', delegateAddress: expected, message: 'Magnee delegate active' }
    }
    const delegatedTo = code.replace(/^0xef0100/i, '0x')
    return { chain, status: 'other', delegateAddress: delegatedTo, message: `Delegated to ${delegatedTo}` }
  } catch {
    return { chain, status: 'error', message: 'RPC error' }
  }
}

// ── Target Execution Detection ──

function analyzeTargetExecution(
  receipt: TransactionReceipt,
  eventNames: Map<string, string>,
  infraAddresses: Set<string>,
  chain: Chain,
): { delegateExecuted: boolean; targetEvents: TargetEvent[] } {
  let delegateExecuted = false
  const targetEvents: TargetEvent[] = []

  for (const log of receipt.logs) {
    const addr = log.address.toLowerCase()
    const topic0 = log.topics[0] as Hex | undefined
    if (!topic0) continue
    const name = eventNames.get(topic0) ?? topic0.slice(0, 10)

    // Match by known topic hash — 4byte.directory may not have this event registered
    if (addr === USER_EOA.toLowerCase() && topic0.toLowerCase() === EXECUTED_EVENT_TOPIC) {
      delegateExecuted = true
    }

    const isInfra = infraAddresses.has(addr) || addr === USER_EOA.toLowerCase()
    if (!isInfra && !BRIDGE_EVENT_NAMES.has(name)) {
      targetEvents.push({ name, address: addr, url: addressUrl(chain, addr) })
    }
  }

  return { delegateExecuted, targetEvents }
}

// ── Main Analysis ──

export async function analyzeTransaction(
  txHash: string,
  sourceChainName: string,
  destChainName?: string,
): Promise<TxAnalysis> {
  const srcChain = resolveChain(sourceChainName)
  if (!srcChain) throw new Error(`Unknown chain: ${sourceChainName}`)
  const destChainHint = destChainName ? resolveChain(destChainName) : undefined

  const srcClient = clientFor(srcChain)
  const [srcReceipt, srcTx] = await Promise.all([
    srcClient.getTransactionReceipt({ hash: txHash as Hex }),
    srcClient.getTransaction({ hash: txHash as Hex }),
  ])

  const gasUsed = Number(srcReceipt.gasUsed)
  const gasLimit = Number(srcTx.gas)
  const gasPct = ((gasUsed / gasLimit) * 100).toFixed(1)
  const method = srcTx.input?.length >= 10 ? await lookup4byte(srcTx.input.slice(0, 10)) : 'transfer'

  const source: SourceInfo = {
    chain: srcChain,
    hash: txHash,
    status: srcReceipt.status === 'success' ? 'success' : 'reverted',
    from: srcReceipt.from,
    to: srcReceipt.to,
    gasUsed: gasUsed.toLocaleString(),
    gasLimit: gasLimit.toLocaleString(),
    gasPct,
    value: formatEther(srcTx.value),
    method,
    nonce: srcTx.nonce,
    url: txUrl(srcChain, txHash),
  }

  // Bridge status
  const lifi = await fetchLiFiStatus(txHash, srcChain.id, destChainHint?.id)
  let bridge: BridgeInfo | null = null
  let destination: DestinationInfo | null = null

  if (lifi) {
    const destChain = lifi.receiving?.chainId ? resolveChain(String(lifi.receiving.chainId)) : destChainHint
    bridge = {
      status: lifi.status,
      substatus: lifi.substatus,
      tool: lifi.tool ?? 'unknown',
      sentAmount: lifi.sending?.amount ? formatUnits(BigInt(lifi.sending.amount), lifi.sending.token.decimals) : '?',
      sentToken: lifi.sending?.token?.symbol ?? '?',
      recvAmount: lifi.receiving?.amount ? formatUnits(BigInt(lifi.receiving.amount), lifi.receiving.token.decimals) : '?',
      recvToken: lifi.receiving?.token?.symbol ?? '?',
      destChain: destChain ?? null,
      destTxHash: lifi.receiving?.txHash ?? null,
    }

    // Destination tx
    if (lifi.receiving?.txHash && destChain) {
      const destClient = clientFor(destChain)
      const destReceipt = await destClient.getTransactionReceipt({ hash: lifi.receiving.txHash as Hex })

      const topics = destReceipt.logs.map(l => l.topics[0]).filter((t): t is Hex => !!t)
      const uniqueTopics = [...new Set(topics)]
      const eventEntries = await Promise.all(uniqueTopics.map(async t => [t, await lookupEvent(t)] as const))
      const eventNames = new Map(eventEntries)

      const infraAddresses = new Set([destReceipt.from.toLowerCase(), (destReceipt.to ?? '').toLowerCase()])
      const userLower = USER_EOA.toLowerCase().slice(2)

      const events: EventInfo[] = destReceipt.logs.map((log, i) => {
        const topic0 = log.topics[0] as Hex | undefined
        const name = topic0 ? (eventNames.get(topic0) ?? topic0.slice(0, 10)) : 'unknown'
        const addr = log.address.toLowerCase()
        const userInvolved = addr.includes(userLower)
          || log.topics.some(t => t?.toLowerCase().includes(userLower))
          || log.data?.toLowerCase().includes(userLower)

        if (topic0 && BRIDGE_EVENT_NAMES.has(name)) infraAddresses.add(addr)

        return { index: i + 1, name, address: log.address, addressUrl: addressUrl(destChain, log.address), userInvolved }
      })

      const exec = analyzeTargetExecution(destReceipt, eventNames, infraAddresses, destChain)

      destination = {
        chain: destChain,
        hash: lifi.receiving.txHash,
        status: destReceipt.status === 'success' ? 'success' : 'reverted',
        from: destReceipt.from,
        to: destReceipt.to,
        gasUsed: Number(destReceipt.gasUsed).toLocaleString(),
        url: txUrl(destChain, lifi.receiving.txHash),
        events,
        delegateExecuted: exec.delegateExecuted,
        targetEvents: exec.targetEvents,
      }
    }
  }

  // Delegation status (all chains)
  const delegations = await Promise.all(SUPPORTED_CHAINS.map(checkDelegation))

  return { source, bridge, destination, delegations }
}

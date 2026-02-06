#!/usr/bin/env bun
/**
 * Magnee Cross-Chain Transaction Analyzer
 *
 * Usage:
 *   bun scripts/analyze-tx.ts <tx_hash> <source_chain>
 *   bun scripts/analyze-tx.ts 0x85550561bcee53392037fbf2fd9863321bfd1a32f5a9259d919e1583a7bc7be1 arbitrum
 *   bun scripts/analyze-tx.ts 0x85550561bcee53392037fbf2fd9863321bfd1a32f5a9259d919e1583a7bc7be1 arb --to base
 */

import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type TransactionReceipt,
  formatEther,
  formatUnits,
} from 'viem'
import { mainnet, arbitrum, base, optimism } from 'viem/chains'

// ── Config ──────────────────────────────────────────────────────────────────

const USER_EOA: Address = '0xA9A1aD47CB9dF79F42B2dc30d9c527D6f42b6eeE'
const PAYABLE_DEMO: Address = '0xf63fB71A13312344C5F27da32803338Da6a3DcEC'

// Per-chain delegate addresses (MagneeDelegateAccount)
const DELEGATE_ADDRS: Record<number, Address> = {
  [optimism.id]: '0x3De7B85259519F95C4b0788e3f1c69A3546447fB',
  [base.id]:     '0x1d114dA79B0c1102Dd14f1A67634F4130b471413',
  [arbitrum.id]: '0x21422c9F4E27Dff05158dA4242637dF483d77422',
}

const PAYABLE_DEMO_ABI = [
  { name: 'totalDonations', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'donations', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

// ── Chain Registry ──────────────────────────────────────────────────────────

const SUPPORTED_CHAINS: Chain[] = [mainnet, arbitrum, base, optimism]

const CHAIN_ALIASES: Record<string, Chain> = Object.fromEntries(
  SUPPORTED_CHAINS.flatMap(chain => {
    const aliases = [
      [chain.name.toLowerCase(), chain],
      [chain.id.toString(), chain],
    ]
    // Shorthand aliases
    const shorts: Record<number, string[]> = {
      [mainnet.id]: ['eth', 'ethereum'],
      [arbitrum.id]: ['arb', 'arbitrum'],
      [base.id]: [],
      [optimism.id]: ['op', 'optimism'],
    }
    for (const [id, names] of Object.entries(shorts)) {
      if (chain.id === Number(id)) {
        aliases.push(...names.map(n => [n, chain]))
      }
    }
    return aliases
  })
)

function resolveChain(nameOrId: string): Chain {
  const chain = CHAIN_ALIASES[nameOrId.toLowerCase()]
  if (!chain) {
    const supported = SUPPORTED_CHAINS.map(c => `${c.name} (${c.id})`).join(', ')
    throw new Error(`Unknown chain "${nameOrId}". Supported: ${supported}`)
  }
  return chain
}

function explorerUrl(chain: Chain): string {
  return chain.blockExplorers?.default?.url ?? ''
}

function txUrl(chain: Chain, hash: string): string {
  return `${explorerUrl(chain)}/tx/${hash}`
}

function addressUrl(chain: Chain, addr: string): string {
  return `${explorerUrl(chain)}/address/${addr}`
}

function clientFor(chain: Chain) {
  return createPublicClient({ chain, transport: http() })
}

// ── Colors ──────────────────────────────────────────────────────────────────

const c = {
  bold:    (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:     (s: string) => `\x1b[2m${s}\x1b[0m`,
  red:     (s: string) => `\x1b[31m${s}\x1b[0m`,
  green:   (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow:  (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue:    (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan:    (s: string) => `\x1b[36m${s}\x1b[0m`,
}

const status = (ok: boolean) => ok ? c.green('✅') : c.red('❌')

// ── Signature Resolution via Foundry (cast 4byte / cast 4byte-event) ────────

const sigCache = new Map<string, string>()

async function castLookup(selector: string, type: 'event' | 'function'): Promise<string> {
  const key = `${type}:${selector}`
  if (sigCache.has(key)) return sigCache.get(key)!

  try {
    const cmd = type === 'event' ? '4byte-event' : '4byte'
    const proc = Bun.spawn(['cast', cmd, selector], { stdout: 'pipe', stderr: 'pipe' })
    const out = await new Response(proc.stdout).text()
    const line = out.trim().split('\n')[0]  // take first match
    if (line) {
      const name = line.split('(')[0]
      sigCache.set(key, name)
      return name
    }
  } catch {}

  const short = selector.slice(0, 10) + '...'
  sigCache.set(key, short)
  return short
}

async function resolveEventName(topic0: Hex): Promise<string> {
  return castLookup(topic0, 'event')
}

async function resolveFunctionName(selector: string): Promise<string> {
  return castLookup(selector, 'function')
}

async function resolveAllEvents(topics: Hex[]): Promise<Map<string, string>> {
  const unique = [...new Set(topics)]
  const results = await Promise.all(unique.map(async t => [t, await resolveEventName(t)] as const))
  return new Map(results)
}

// ── Li.Fi Status ────────────────────────────────────────────────────────────

interface LiFiStatus {
  status: string
  substatus: string
  tool: string
  sending: { amount: string; token: { symbol: string; decimals: number } }
  receiving: {
    txHash?: string
    chainId?: number
    amount: string
    token: { symbol: string; decimals: number }
  }
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

// ── Target Execution Detection ──────────────────────────────────────────────

const BRIDGE_EVENT_NAMES = new Set([
  'ComposeDelivered', 'AssetSwapped', 'LiFiTransferCompleted',
  'LiFiGenericSwapCompleted', 'OFTReceived', 'Packet',
])

interface TargetExecution {
  delegateExecuted: boolean
  targetEvents: { name: string; addr: string; url: string }[]
}

function analyzeTargetExecution(
  receipt: TransactionReceipt,
  eventNames: Map<string, string>,
  infraAddresses: Set<string>,
  chain: Chain,
): TargetExecution {
  let delegateExecuted = false
  const targetEvents: { name: string; addr: string; url: string }[] = []

  for (const log of receipt.logs) {
    const addr = log.address.toLowerCase()
    const topic0 = log.topics[0] as Hex | undefined
    if (!topic0) continue

    const name = eventNames.get(topic0) ?? topic0.slice(0, 10)

    // Detect delegate execution on user's EOA
    if (addr === USER_EOA.toLowerCase() && ['Executed', 'ExecutionSuccess', 'CallExecuted'].includes(name)) {
      delegateExecuted = true
    }

    // Target = not bridge infra, not user EOA
    const isInfra = infraAddresses.has(addr) || addr === USER_EOA.toLowerCase()
    if (!isInfra && !BRIDGE_EVENT_NAMES.has(name)) {
      targetEvents.push({ name, addr, url: addressUrl(chain, addr) })
    }
  }

  return { delegateExecuted, targetEvents }
}

// ── Delegation Check ────────────────────────────────────────────────────────

async function checkDelegation(chain: Chain): Promise<string> {
  try {
    const client = clientFor(chain)
    const code = await client.getCode({ address: USER_EOA })

    if (!code || code === '0x') return c.red('❌ No delegation')

    const expected = DELEGATE_ADDRS[chain.id]
    if (expected && code.toLowerCase().includes(expected.slice(2).toLowerCase())) {
      return `${c.green('✅ Magnee delegate')}\n         ${c.dim(addressUrl(chain, expected))}`
    }
    const delegatedTo = code.replace(/^0xef0100/i, '0x')
    const lines = [`${c.yellow('⚠️  Other contract')} ${delegatedTo}`, `         ${c.dim(addressUrl(chain, delegatedTo))}`]
    if (expected) lines.push(`         ${c.dim(`Expected: ${expected}`)}`)
    return lines.join('\n')
  } catch {
    return c.dim('? RPC error')
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log(`${c.red('Usage:')} bun scripts/analyze-tx.ts <tx_hash> <source_chain> [--to <dest_chain>]`)
    console.log(`${c.dim('Example:')} bun scripts/analyze-tx.ts 0x8555...7be1 arbitrum`)
    console.log(`${c.dim('Chains:')} ${SUPPORTED_CHAINS.map(ch => ch.name.toLowerCase()).join(', ')}`)
    process.exit(1)
  }

  const txHash = args[0] as Hex
  const srcChain = resolveChain(args[1])
  const toFlag = args.indexOf('--to')
  const destChainHint = toFlag >= 0 ? resolveChain(args[toFlag + 1]) : undefined

  const line = c.cyan('═'.repeat(55))
  console.log(`\n${line}`)
  console.log(c.bold(c.cyan('  🧲 Magnee Cross-Chain Transaction Analyzer')))
  console.log(`${line}\n`)

  // ── Source Transaction ──
  console.log(c.bold('📤 SOURCE TRANSACTION'))
  console.log(`  Chain:  ${c.green(srcChain.name)} (${srcChain.id})`)
  console.log(`  Tx:     ${c.blue(txUrl(srcChain, txHash))}`)

  const srcClient = clientFor(srcChain)
  const [srcReceipt, srcTx] = await Promise.all([
    srcClient.getTransactionReceipt({ hash: txHash }),
    srcClient.getTransaction({ hash: txHash }),
  ])

  const srcOk = srcReceipt.status === 'success'
  console.log(`  Status: ${status(srcOk)} ${srcOk ? 'Success' : 'REVERTED'}`)
  console.log(`  From:   ${srcReceipt.from}`)
  console.log(`  To:     ${srcReceipt.to}`)
  console.log(`  Gas:    ${srcReceipt.gasUsed.toLocaleString()} / ${srcTx.gas.toLocaleString()}`)
  console.log(`  Nonce:  ${srcTx.nonce}`)
  console.log(`  Type:   ${srcTx.type}`)

  // Decode calldata selector
  if (srcTx.input && srcTx.input.length >= 10) {
    const selector = srcTx.input.slice(0, 10)
    const fnName = await resolveFunctionName(selector)
    const dataBytes = (srcTx.input.length - 2) / 2
    console.log(`  Method: ${selector} ${c.dim(`(${fnName})`)}`)
    console.log(`  Data:   ${dataBytes.toLocaleString()} bytes`)
    console.log('\n')
  }

  // ── Source TX revert diagnostics ──
  if (!srcOk) {
    console.log(c.bold(c.red('🔍 REVERT ANALYSIS')))

    // Gas analysis
    const gasUsed = Number(srcReceipt.gasUsed)
    const gasLimit = Number(srcTx.gas)
    const gasPct = ((gasUsed / gasLimit) * 100).toFixed(1)
    console.log(`  Gas used: ${gasUsed.toLocaleString()} / ${gasLimit.toLocaleString()} (${gasPct}%)`)

    if (gasUsed / gasLimit > 0.95) {
      console.log(c.red(`  ⛽ OUT OF GAS — consumed ${gasPct}% of gas limit`))
      console.log(c.dim('  → The gas estimate was too low for this execution path'))
    } else {
      console.log(c.dim('  → Reverted before gas limit (explicit revert or require failure)'))
    }
    console.log('\n')
  }

  // ── Bridge Status ──
  console.log(c.bold('🌉 BRIDGE STATUS (Li.Fi)'))
  const lifi = await fetchLiFiStatus(txHash, srcChain.id, destChainHint?.id)

  if (!lifi) {
    console.log(c.yellow('  ⚠️  Could not reach Li.Fi API\n'))
  } else {
    const { status: ls, substatus, tool, sending: s, receiving: r } = lifi
    const lsIcon = ls === 'DONE' ? c.green('✅') : ls === 'PENDING' ? c.yellow('⏳') : c.red('❌')
    console.log(`  Status: ${lsIcon} ${ls} (${substatus ?? ''})`)
    console.log(`  Bridge: ${tool ?? 'unknown'}`)

    const sentAmt = s?.amount ? formatUnits(BigInt(s.amount), s.token.decimals) : '?'
    const recvAmt = r?.amount ? formatUnits(BigInt(r.amount), r.token.decimals) : '?'
    console.log(`  Sent:   ${sentAmt} ${s?.token?.symbol ?? '?'} on ${srcChain.name}`)

    const destChain = r?.chainId ? resolveChain(String(r.chainId)) : destChainHint
    console.log(`  Recv:   ${recvAmt} ${r?.token?.symbol ?? '?'} on ${destChain?.name ?? '?'}\n`)

    // ── Destination Transaction ──
    if (!r?.txHash || !destChain) {
      console.log(c.yellow('  ⚠️  No destination tx yet (bridge may be pending)\n'))
    } else {
      console.log(c.bold('📥 DESTINATION TRANSACTION'))
      console.log(`  Chain:  ${c.green(destChain.name)} (${destChain.id})`)
      console.log(`  Tx:     ${c.blue(txUrl(destChain, r.txHash))}`)

      const destClient = clientFor(destChain)
      const destReceipt = await destClient.getTransactionReceipt({ hash: r.txHash as Hex })

      const destOk = destReceipt.status === 'success'
      console.log(`  Status: ${status(destOk)} ${destOk ? 'Success' : 'Reverted'}`)
      console.log(`  From:   ${destReceipt.from} ${c.dim('(relayer/executor)')}`)
      console.log(`  To:     ${destReceipt.to}`)
      console.log(`  Gas:    ${destReceipt.gasUsed.toLocaleString()}\n`)

      // ── Event Analysis ──
      console.log(c.bold('📋 EVENT ANALYSIS'))

      const topics = destReceipt.logs
        .map(l => l.topics[0])
        .filter((t): t is Hex => !!t)

      const eventNames = await resolveAllEvents(topics)
      console.log(`  Total events: ${destReceipt.logs.length}`)

      // Collect infra addresses (from, to, and known bridge contracts)
      const infraAddresses = new Set([
        destReceipt.from.toLowerCase(),
        (destReceipt.to ?? '').toLowerCase(),
      ])

      for (const log of destReceipt.logs) {
        const addr = log.address.toLowerCase()
        const topic0 = log.topics[0] as Hex | undefined
        if (!topic0) continue

        const name = eventNames.get(topic0) ?? topic0.slice(0, 10)
        const userLower = USER_EOA.toLowerCase().slice(2) // without 0x
        const userInvolved = addr.includes(userLower)
          || log.topics.some(t => t?.toLowerCase().includes(userLower))
          || log.data?.toLowerCase().includes(userLower)

        const icon = userInvolved ? '👤' : '  '
        const idx = String(destReceipt.logs.indexOf(log) + 1).padStart(2)
        console.log(`  ${icon} ${idx}. ${name.padEnd(30)} @ ${addr}`)
        console.log(`          ${c.dim(addressUrl(destChain, addr))}`)

        // Track infra addresses by event name
        if (BRIDGE_EVENT_NAMES.has(name)) infraAddresses.add(addr)
      }

      // Target execution
      const exec = analyzeTargetExecution(destReceipt, eventNames, infraAddresses, destChain)
      console.log(`\n  🎯 TARGET EXECUTION:`)

      if (exec.delegateExecuted) {
        console.log(`     ${c.green('✅')} executeSingle fired on EOA (delegate code ran)`)
      } else {
        console.log(`     ${c.yellow('⚠️')}  No delegate Executed event found`)
      }

      if (exec.targetEvents.length) {
        for (const e of exec.targetEvents) {
          console.log(`     ${c.green('✅')} ${e.name.padEnd(30)} @ ${e.addr}`)
          console.log(`        ${c.dim(e.url)}`)
        }
        console.log(`     → Original intercepted tx: ${c.green(c.bold('EXECUTED ✅'))}`)
      } else {
        console.log(`     ${c.red('❌')} No target contract events — call may have reverted`)
      }
      console.log()

      // ── Demo Contract State ──
      if (destChain.id === base.id) {
        console.log(c.bold('\n  📊 DEMO CONTRACT STATE (Base)'))
        try {
          const [total, userDonations] = await Promise.all([
            destClient.readContract({ address: PAYABLE_DEMO, abi: PAYABLE_DEMO_ABI, functionName: 'totalDonations' }),
            destClient.readContract({ address: PAYABLE_DEMO, abi: PAYABLE_DEMO_ABI, functionName: 'donations', args: [USER_EOA] }),
          ])
          console.log(`  Total donations:  ${formatEther(total)} ETH`)
          console.log(`  Your donations:   ${formatEther(userDonations)} ETH\n`)
        } catch {
          console.log(c.dim('  Could not read demo contract\n'))
        }
      }

      // ── Summary ──
      console.log(line)
      console.log(c.bold('  SUMMARY'))
      console.log(line)
      console.log(`  ${srcChain.name} → ${destChain.name} via ${tool}`)
      console.log(`  Sent: ${sentAmt} ${s.token.symbol} → Received: ${recvAmt} ${r.token?.symbol}`)
      console.log(`  Result: ${destOk ? c.green(c.bold('✅ COMPLETE')) : c.red(c.bold('❌ DESTINATION FAILED'))}`)
    }
  }

  // ── Delegation Status ──
  console.log(`\n${c.bold('🔑 DELEGATION STATUS')}`)
  const delegationResults = await Promise.all(
    SUPPORTED_CHAINS.map(async chain => ({
      name: chain.name,
      status: await checkDelegation(chain),
    }))
  )
  for (const { name, status } of delegationResults) {
    console.log(`  ${name}: ${status}`)
  }
  console.log()
}

main().catch(err => {
  console.error(c.red(`Error: ${err.message}`))
  process.exit(1)
})

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useSendTransaction, useReadContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi'
import { parseEther, formatEther, encodeFunctionData } from 'viem'
import { DEMO_ADDRESSES, DELEGATE_ADDRESSES, DEMO_ABI, explorerAddress } from './wagmi'
import './App.css'

// RPC URLs for checking delegation status
const RPC_URLS: Record<number, string> = {
  10: 'https://mainnet.optimism.io',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
}

function DelegationSection({
  address,
  chainId,
  delegateAddress,
  log,
}: {
  address: `0x${string}`
  chainId: number
  delegateAddress?: `0x${string}`
  log: (msg: string) => void
}) {
  const [delegationState, setDelegationState] = useState<'checking' | 'delegated' | 'delegated_other' | 'not_delegated' | 'error'>('checking')
  const [delegatedTo, setDelegatedTo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { data: walletClient } = useWalletClient()

  // Check delegation status via direct RPC
  useEffect(() => {
    const rpc = RPC_URLS[chainId]
    if (!rpc || !address) return

    setDelegationState('checking')
    fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getCode',
        params: [address, 'latest'],
      }),
    })
      .then(r => r.json())
      .then(data => {
        const code = data.result
        if (!code || code === '0x' || code.length < 48) {
          setDelegationState('not_delegated')
          setDelegatedTo(null)
        } else {
          const to = '0x' + code.slice(8).toLowerCase()
          if (delegateAddress && to === delegateAddress.toLowerCase()) {
            setDelegationState('delegated')
          } else {
            setDelegationState('delegated_other')
            setDelegatedTo(to)
          }
        }
      })
      .catch(() => setDelegationState('error'))
  }, [address, chainId, delegateAddress])

  async function sendDelegation(targetAddress: string, action: string) {
    if (!walletClient) {
      log(`❌ No wallet client available`)
      return
    }
    setPending(true)
    const hexChainId = `0x${chainId.toString(16)}`
    const isRevoke = targetAddress === '0x0000000000000000000000000000000000000000'

    // Step 0: Check wallet capabilities
    try {
      log(`🔍 [${action}] Checking wallet_getCapabilities...`)
      const provider = (window as any).ethereum
      const caps = await provider.request({
        method: 'wallet_getCapabilities',
        params: [address],
      })
      log(`📋 [${action}] Capabilities: ${JSON.stringify(caps).slice(0, 200)}`)
    } catch (e: any) {
      log(`⚠️ [${action}] wallet_getCapabilities not supported: ${e?.message?.slice(0, 80)}`)
    }

    // Method 1: wallet_sendCalls with delegation: true (ERC-5792 standard format)
    try {
      log(`📤 [${action}] M1: wallet_sendCalls {delegation: true}...`)
      const provider = (window as any).ethereum
      const result = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1',
          chainId: hexChainId,
          from: address,
          calls: [{ to: address, value: '0x0', data: '0x' }],
          capabilities: {
            delegation: true,
          }
        }]
      })
      log(`✅ [${action}] M1 succeeded: ${JSON.stringify(result)}`)
      setPending(false)
      return
    } catch (e: any) {
      log(`⚠️ [${action}] M1 failed: ${e?.message?.slice(0, 120)}`)
    }

    // Method 2: wallet_sendCalls with delegation as contract address (chain-scoped)
    try {
      log(`📤 [${action}] M2: wallet_sendCalls {delegation: "${targetAddress.slice(0, 10)}..."}...`)
      const provider = (window as any).ethereum
      const result = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1',
          chainId: hexChainId,
          from: address,
          calls: [{ to: address, value: '0x0', data: '0x' }],
          capabilities: {
            [hexChainId]: {
              delegation: targetAddress,
            }
          }
        }]
      })
      log(`✅ [${action}] M2 succeeded: ${JSON.stringify(result)}`)
      setPending(false)
      return
    } catch (e: any) {
      log(`⚠️ [${action}] M2 failed: ${e?.message?.slice(0, 120)}`)
    }

    // Method 3: eth_sendTransaction type 0x04 with authorizationList
    try {
      log(`📤 [${action}] M3: eth_sendTransaction type 0x04...`)
      const provider = (window as any).ethereum
      const result = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          type: '0x04',
          from: address,
          to: address,
          value: '0x0',
          data: '0x',
          authorizationList: [{
            address: targetAddress,
            chainId: hexChainId,
          }]
        }]
      })
      log(`✅ [${action}] M3 succeeded: ${result}`)
      setPending(false)
      return
    } catch (e: any) {
      log(`❌ [${action}] M3 failed: ${e?.message?.slice(0, 120)}`)
    }

    // Method 4: Try with ORIGINAL provider (bypass Magnee wrapper)
    try {
      log(`📤 [${action}] M4: eth_sendTransaction (bypass wrapper)...`)
      const originals = (window as any).__magneeOriginalProviders
      const provider = originals?.[0] || (window as any).ethereum
      const result = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          type: '0x04',
          from: address,
          to: address,
          value: '0x0',
          data: '0x',
          authorizationList: [{
            address: targetAddress,
            chainId: hexChainId,
          }]
        }]
      })
      log(`✅ [${action}] M4 succeeded: ${result}`)
      setPending(false)
      return
    } catch (e: any) {
      log(`❌ [${action}] M4 failed: ${e?.message?.slice(0, 120)}`)
    }

    log(`💀 [${action}] All methods failed. Wallet does not support dapp-initiated EIP-7702.`)
    setPending(false)
  }

  const statusLabel = {
    checking: '⏳ Checking...',
    delegated: '✅ Delegated to Magnee',
    delegated_other: `⚠️ Delegated to other: ${delegatedTo?.slice(0, 10)}...`,
    not_delegated: '— Not delegated',
    error: '❌ Check failed',
  }

  return (
    <div>
      <p><strong>Status:</strong> {statusLabel[delegationState]}</p>
      <div className="buttons" style={{ marginTop: '8px' }}>
        {delegateAddress && delegationState === 'not_delegated' && (
          <button
            onClick={() => sendDelegation(delegateAddress, 'Delegate')}
            disabled={pending}
          >
            {pending ? 'Sending...' : `Delegate to Magnee`}
          </button>
        )}
        {(delegationState === 'delegated' || delegationState === 'delegated_other') && (
          <button
            onClick={() => sendDelegation('0x0000000000000000000000000000000000000000', 'Revoke')}
            disabled={pending}
            className="secondary"
          >
            {pending ? 'Sending...' : 'Revoke Delegation'}
          </button>
        )}
      </div>
    </div>
  )
}

function App() {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  const [ethAmount, setEthAmount] = useState('0.0001') // Default smaller for real nets
  const [logs, setLogs] = useState<string[]>([])
  const [magneeActive, setMagneeActive] = useState(false)

  // Dynamic Address Selection
  const activeChainId = chain?.id || 1
  const currentDemoAddress = DEMO_ADDRESSES[activeChainId]
  const currentDelegateAddress = DELEGATE_ADDRESSES[activeChainId]

  const { data: totalDonations, refetch: refetchDonations } = useReadContract({
    address: currentDemoAddress,
    abi: DEMO_ABI,
    functionName: 'totalDonations',
  })

  const { sendTransaction, data: txHash, isPending } = useSendTransaction()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 50)])
    console.log(msg)
  }

  // Check for Magnee extension
  useEffect(() => {
    const check = () => {
      const active = !!(window as any).ethereum?._magneeWrapped
      setMagneeActive(active)
      log(active ? '✅ Magnee extension detected!' : '❌ Magnee extension not detected')
    }
    setTimeout(check, 500)
  }, [])

  // Log transaction confirmations
  useEffect(() => {
    if (isConfirmed && txHash) {
      log(`✅ Transaction confirmed: ${txHash.slice(0, 18)}...`)
      refetchDonations()
    }
  }, [isConfirmed, txHash])

  const directDonate = () => {
    log(`Sending direct donation of ${ethAmount} ETH to PayableDemo (${activeChainId})...`)
    sendTransaction({
      to: currentDemoAddress,
      value: parseEther(ethAmount),
      data: encodeFunctionData({
        abi: DEMO_ABI,
        functionName: 'donate',
        args: ['Direct donation from demo'],
      }),
    })
  }

  return (
    <div className="app">
      <header>
        <h1>🧲 Magnee Demo</h1>
      </header>

      <section className="card">
        <h2>📍 Contracts</h2>
        <div className="addresses">
          <div>
            <label>PayableDemo ({chain?.name || 'Local'})</label>
            {currentDemoAddress ? (
              <a href={explorerAddress(activeChainId, currentDemoAddress)} target="_blank" rel="noopener noreferrer">
                <code>{currentDemoAddress}</code>
              </a>
            ) : <code>N/A</code>}
          </div>
          <div>
            <label>Delegate ({chain?.name || 'Local'})</label>
            {currentDelegateAddress ? (
              <a href={explorerAddress(activeChainId, currentDelegateAddress)} target="_blank" rel="noopener noreferrer">
                <code>{currentDelegateAddress}</code>
              </a>
            ) : <code>N/A</code>}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>🔗 Connection</h2>
        <div className="status-grid">
          <div className="status-item">
            <label>Chain</label>
            <span>{chain?.name || '-'}</span>
          </div>
          <div className="status-item">
            <label>Balance</label>
            <span>{balance ? `${Number(formatEther(balance.value)).toFixed(4)} ETH` : '-'}</span>
          </div>
          <div className="status-item">
            <label>Magnee</label>
            <span>{magneeActive ? '✅' : '❌'}</span>
          </div>
        </div>

        {isConnected ? (
          <div className="connected">
            <code>{address?.slice(0, 10)}...{address?.slice(-8)}</code>
            <button onClick={() => disconnect()} className="secondary">Disconnect</button>
          </div>
        ) : (
          <div className="connectors">
            {connectors.map((connector) => (
              <button key={connector.uid} onClick={() => connect({ connector })}>
                Connect {connector.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>🧪 Test Transactions</h2>
        <div className="input-row">
          <label>ETH Amount:</label>
          <input
            type="text"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
          />
          <span>ETH</span>
        </div>

        <div className="buttons">
          <button onClick={directDonate} disabled={!isConnected || isPending}>
            {isPending ? 'Sending...' : 'Donate'}
          </button>
          <button onClick={() => refetchDonations()} className="secondary">
            Refresh Balance
          </button>
        </div>

        <div className="donations">
          <strong>Total Donations:</strong>{' '}
          {totalDonations !== undefined ? formatEther(totalDonations) : '...'} ETH
        </div>

        {isConfirming && <p className="pending">⏳ Confirming transaction...</p>}
      </section>

      {/* 7702 Delegation Section */}
      {isConnected && (
        <section className="card">
          <h2>🔗 EIP-7702 Delegation</h2>
          <DelegationSection
            address={address!}
            chainId={activeChainId}
            delegateAddress={currentDelegateAddress}
            log={log}
          />
        </section>
      )}

      <section className="card">
        <h2>📋 Log</h2>
        <div className="log">
          {logs.map((msg, i) => (
            <div key={i} className="log-entry">{msg}</div>
          ))}
          {logs.length === 0 && <div className="log-entry muted">Waiting for actions...</div>}
        </div>
      </section>
    </div>
  )
}

export default App

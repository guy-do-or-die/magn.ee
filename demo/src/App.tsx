import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useSendTransaction, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther, encodeFunctionData } from 'viem'
import { DEMO_ADDRESSES, DELEGATE_ADDRESSES, DEMO_ABI, explorerAddress } from './wagmi'
import './App.css'

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

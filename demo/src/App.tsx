import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useSendTransaction, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther, encodeFunctionData } from 'viem'
import { ROUTER_ADDRESS, DEMO_ADDRESS, ROUTER_ABI, DEMO_ABI } from './wagmi'
import './App.css'

function App() {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  const [ethAmount, setEthAmount] = useState('0.01')
  const [logs, setLogs] = useState<string[]>([])
  const [magneeActive, setMagneeActive] = useState(false)

  const { data: totalDonations, refetch: refetchDonations } = useReadContract({
    address: DEMO_ADDRESS,
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
    log(`Sending direct donation of ${ethAmount} ETH to PayableDemo...`)
    sendTransaction({
      to: DEMO_ADDRESS,
      value: parseEther(ethAmount),
      data: encodeFunctionData({
        abi: DEMO_ABI,
        functionName: 'donate',
        args: ['Direct donation from demo'],
      }),
    })
  }

  const viaMagneeRouter = () => {
    log(`Sending ${ethAmount} ETH via MagneeRouter.forward()...`)
    const innerCalldata = encodeFunctionData({
      abi: DEMO_ABI,
      functionName: 'donate',
      args: ['Via MagneeRouter'],
    })

    sendTransaction({
      to: ROUTER_ADDRESS,
      value: parseEther(ethAmount),
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: 'forward',
        args: [DEMO_ADDRESS, innerCalldata],
      }),
    })
  }

  return (
    <div className="app">
      <header>
        <h1>🧲 Magnee Demo</h1>
        <p className="subtitle">Testing with Anvil Local Blockchain</p>
      </header>

      <section className="card">
        <h2>📍 Contracts</h2>
        <div className="addresses">
          <div>
            <label>MagneeRouter</label>
            <code>{ROUTER_ADDRESS}</code>
          </div>
          <div>
            <label>PayableDemo</label>
            <code>{DEMO_ADDRESS}</code>
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
            {isPending ? 'Sending...' : '1. Direct Donate'}
          </button>
          <button onClick={viaMagneeRouter} disabled={!isConnected || isPending}>
            {isPending ? 'Sending...' : '2. Via Router'}
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

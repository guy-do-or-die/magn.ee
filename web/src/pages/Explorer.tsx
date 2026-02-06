import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Loader2, ExternalLink, CheckCircle, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'
import { CHAIN_META, getChainMeta } from '@/lib/constants'
import { analyzeTransaction, type TxAnalysis } from '@/lib/explorer'
import { shortenAddress } from '@/lib/utils'

export function Explorer() {
  const [txHash, setTxHash] = useState('')
  const [chainName, setChainName] = useState('arb')
  const [destChainName, setDestChainName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TxAnalysis | null>(null)

  const handleSearch = async () => {
    if (!txHash.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const dest = destChainName === 'auto' ? '' : destChainName
      const analysis = await analyzeTransaction(txHash.trim(), chainName, dest || undefined)
      setResult(analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fade-up mx-auto max-w-4xl px-6 pb-16 pt-28">
      {/* Header */}
      <div className="mb-10">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Explorer</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Transaction Explorer</h1>
        <p className="mt-3 text-muted-foreground">
          Analyze cross-chain "magneefied" transactions. Trace the lifecycle from source to destination.
        </p>
      </div>

      {/* Search */}
      <Card className="glass-card gradient-border mb-8 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tx-hash">Transaction Hash</Label>
              <Input
                id="tx-hash"
                placeholder="0x..."
                value={txHash}
                onChange={e => setTxHash(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="h-11"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label>Source Chain</Label>
                <Select value={chainName} onValueChange={setChainName}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAIN_META.map(m => (
                      <SelectItem key={m.chain.id} value={m.key}>
                        <div className="flex items-center gap-2">
                          <img src={m.icon} alt="" className="h-4 w-4" />
                          {m.chain.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label>Destination <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={destChainName} onValueChange={setDestChainName}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Auto-detect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    {CHAIN_META.map(m => (
                      <SelectItem key={m.chain.id} value={m.key}>
                        <div className="flex items-center gap-2">
                          <img src={m.icon} alt="" className="h-4 w-4" />
                          {m.chain.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSearch} disabled={loading || !txHash.trim()} className="glow-btn gap-2 rounded-xl py-6 text-base">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? 'Analyzing…' : 'Analyze Transaction'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-8 border-destructive/50 rounded-2xl">
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && <TxResult data={result} />}
    </div>
  )
}

function TxResult({ data }: { data: TxAnalysis }) {
  const { source, bridge, destination, delegations } = data
  const srcMeta = getChainMeta(source.chain.id)

  return (
    <div className="space-y-6">
      {/* Source Transaction */}
      <Card className="glass-card gradient-border rounded-2xl fade-up">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">📤 Source Transaction</CardTitle>
            <Badge variant={source.status === 'success' ? 'success' : 'destructive'}>
              {source.status === 'success' ? 'Success' : 'Reverted'}
            </Badge>
          </div>
          <CardDescription className="flex items-center gap-2">
            {srcMeta && <img src={srcMeta.icon} className="h-4 w-4" alt="" />}
            {source.chain.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Hash</dt>
            <dd className="font-mono">
              <a href={source.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                {shortenAddress(source.hash, 8)} <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-mono">{shortenAddress(source.from)}</dd>
            <dt className="text-muted-foreground">To</dt>
            <dd className="font-mono">{source.to ? shortenAddress(source.to) : '—'}</dd>
            <dt className="text-muted-foreground">Method</dt>
            <dd><Badge variant="outline" className="text-xs">{source.method}</Badge></dd>
            <dt className="text-muted-foreground">Gas</dt>
            <dd>{source.gasUsed} / {source.gasLimit} <span className="text-muted-foreground">({source.gasPct}%)</span></dd>
            <dt className="text-muted-foreground">Value</dt>
            <dd>{source.value} ETH</dd>
          </dl>
        </CardContent>
      </Card>

      {/* Bridge Status */}
      {bridge && (
        <Card className="glass-card gradient-border rounded-2xl fade-up fade-up-d1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">🌉 Bridge Status</CardTitle>
              <Badge variant={bridge.status === 'DONE' ? 'success' : bridge.status === 'PENDING' ? 'warning' : 'destructive'}>
                {bridge.status}
              </Badge>
            </div>
            <CardDescription>via <span className="text-foreground/80 font-medium">{bridge.tool}</span></CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-6 rounded-xl bg-muted/30 p-5 text-sm">
              <div className="text-center">
                <p className="text-lg font-bold">{bridge.sentAmount}</p>
                <p className="mt-1 text-xs text-muted-foreground">{bridge.sentToken}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ArrowRight className="h-5 w-5 text-primary" />
                <span className="text-[10px] text-muted-foreground">{bridge.tool}</span>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{bridge.recvAmount}</p>
                <p className="mt-1 text-xs text-muted-foreground">{bridge.recvToken}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Destination */}
      {destination && (
        <Card className="glass-card gradient-border rounded-2xl fade-up fade-up-d2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">📥 Destination Transaction</CardTitle>
              <Badge variant={destination.status === 'success' ? 'success' : 'destructive'}>
                {destination.status === 'success' ? 'Success' : 'Reverted'}
              </Badge>
            </div>
            <CardDescription className="flex items-center gap-2">
              {getChainMeta(destination.chain.id) && (
                <img src={getChainMeta(destination.chain.id)!.icon} className="h-4 w-4" alt="" />
              )}
              {destination.chain.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Hash</dt>
              <dd className="font-mono">
                <a href={destination.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                  {shortenAddress(destination.hash, 8)} <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
              <dt className="text-muted-foreground">Gas Used</dt>
              <dd>{destination.gasUsed}</dd>
            </dl>

            <Separator className="!bg-border/50" />

            {/* Target Execution */}
            <div>
              <h4 className="mb-3 text-sm font-semibold">🎯 Target Execution</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {destination.delegateExecuted
                    ? <><CheckCircle className="h-4 w-4 text-emerald-400" /> <span>Delegate code executed on EOA</span></>
                    : <><AlertTriangle className="h-4 w-4 text-amber-400" /> <span>No delegate Executed event</span></>
                  }
                </div>
                {destination.targetEvents.length > 0 ? (
                  destination.targetEvents.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 pl-6">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      <Badge variant="outline" className="text-xs font-mono">{e.name}</Badge>
                      <a href={e.url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">
                        {shortenAddress(e.address)}
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 pl-6">
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-muted-foreground">No target contract events</span>
                  </div>
                )}
              </div>
            </div>

            <Separator className="!bg-border/50" />

            {/* Events */}
            <div>
              <h4 className="mb-3 text-sm font-semibold">📋 Events ({destination.events.length})</h4>
              <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl bg-muted/20 p-2 text-xs">
                {destination.events.map(ev => (
                  <div key={ev.index} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${ev.userInvolved ? 'bg-primary/5 border border-primary/10' : ''}`}>
                    <span className="w-5 text-right text-muted-foreground">{ev.index}</span>
                    {ev.userInvolved && <span>👤</span>}
                    <span className="font-mono">{ev.name}</span>
                    <a href={ev.addressUrl} target="_blank" rel="noopener" className="ml-auto text-muted-foreground hover:text-foreground">
                      {shortenAddress(ev.address)}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delegation Status */}
      <Card className="glass-card gradient-border rounded-2xl fade-up fade-up-d3">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">🔑 Delegation Status</CardTitle>
          <CardDescription>EIP-7702 delegation across all chains</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {delegations.map(del => {
              const meta = getChainMeta(del.chain.id)
              return (
                <div key={del.chain.id} className="flex flex-col items-center gap-2 rounded-xl bg-muted/20 border border-border/50 p-4 text-center">
                  {meta && <img src={meta.icon} className="h-7 w-7" alt="" />}
                  <p className="text-sm font-medium">{del.chain.name}</p>
                  <Badge
                    variant={del.status === 'delegated' ? 'success' : del.status === 'none' ? 'outline' : del.status === 'other' ? 'warning' : 'secondary'}
                    className="max-w-full truncate text-[10px]"
                  >
                    {del.status === 'delegated' ? 'Active' : del.status === 'none' ? 'None' : del.status === 'other' ? 'Other' : del.message}
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

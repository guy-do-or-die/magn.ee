import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { CHAIN_META, DELEGATE_ADDRS, USER_EOA } from '@/lib/constants'
import { createPublicClient, http } from 'viem'
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'

interface DelegationState {
  chainId: number
  status: 'loading' | 'delegated' | 'none' | 'other' | 'error'
}

export function Chains() {
  const [delegations, setDelegations] = useState<DelegationState[]>(
    CHAIN_META.map(m => ({ chainId: m.chain.id, status: 'loading' as const }))
  )

  useEffect(() => {
    CHAIN_META.forEach(async (meta, i) => {
      try {
        const client = createPublicClient({ chain: meta.chain, transport: http() })
        const code = await client.getCode({ address: USER_EOA })
        let status: DelegationState['status'] = 'none'
        if (code && code !== '0x') {
          const expected = DELEGATE_ADDRS[meta.chain.id]
          status = expected && code.toLowerCase().includes(expected.slice(2).toLowerCase()) ? 'delegated' : 'other'
        }
        setDelegations(prev => prev.map((d, j) => j === i ? { ...d, status } : d))
      } catch {
        setDelegations(prev => prev.map((d, j) => j === i ? { ...d, status: 'error' } : d))
      }
    })
  }, [])

  return (
    <section className="relative px-6 py-32">
      <div className="section-divider mb-32" />
      <div className="mx-auto max-w-5xl">
        <div className="mb-20 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Chains</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Live on four networks
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Real-time delegation status for the pilot EOA
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CHAIN_META.map((meta, i) => {
            const del = delegations.find(d => d.chainId === meta.chain.id)
            const status = del?.status ?? 'loading'

            return (
              <div
                key={meta.chain.id}
                className={`fade-up fade-up-d${i + 1} glass-card gradient-border group flex flex-col items-center gap-5 rounded-2xl p-6 text-center`}
              >
                <div className="relative">
                  <img
                    src={meta.icon}
                    alt={meta.chain.name}
                    className="h-14 w-14 transition-transform duration-300 group-hover:scale-110"
                  />
                  {/* Status indicator dot */}
                  <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background ${
                    status === 'delegated' ? 'bg-emerald-500' :
                    status === 'other' ? 'bg-amber-500' :
                    status === 'loading' ? 'bg-muted' : 'bg-red-500'
                  }`}>
                    {status === 'loading' && <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />}
                    {status === 'delegated' && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                    {status === 'other' && <AlertTriangle className="h-2 w-2 text-white" />}
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold">{meta.chain.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Chain {meta.chain.id}</p>
                </div>

                <Badge
                  variant={
                    status === 'delegated' ? 'success' :
                    status === 'other' ? 'warning' :
                    'outline'
                  }
                  className="text-[10px]"
                >
                  {status === 'loading' && 'Checking…'}
                  {status === 'delegated' && 'Delegate Active'}
                  {status === 'none' && 'Not Delegated'}
                  {status === 'other' && 'Other Delegate'}
                  {status === 'error' && 'RPC Error'}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

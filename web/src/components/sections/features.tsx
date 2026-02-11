import { Globe, Fingerprint, Layers, Eye } from 'lucide-react'

const FEATURES = [
  {
    icon: Globe,
    title: 'Cross-Chain Payments',
    description: 'Pay on Base with funds on Arbitrum. Magnee bridges and swaps automatically via Li.Fi.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Fingerprint,
    title: 'msg.sender Preserved',
    description: 'EIP-7702 delegation ensures your EOA is the caller. NFTs, DeFi positions, and whitelists all work.',
    gradient: 'from-purple-500 to-violet-500',
  },
  {
    icon: Eye,
    title: 'Zero-Config Detection',
    description: 'No dApp integration needed. Magnee wraps EIP-1193 providers to detect eth_sendTransaction globally.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Layers,
    title: 'Multi-Chain Native',
    description: 'Ethereum, Arbitrum, Base, and Optimism today. Extensible to any EIP-7702 compatible chain.',
    gradient: 'from-emerald-500 to-teal-500',
  },
] as const

export function Features() {
  return (
    <section className="relative px-6 py-32">
      <div className="section-divider mb-32" />
      <div className="mx-auto max-w-5xl">
        <div className="mb-20 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Features</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Built for the multi-chain world
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Protocol-neutral. Wallet-native. Your EOA stays msg.sender.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={`fade-up fade-up-d${i + 1} glass-card gradient-border shine-on-hover group rounded-2xl p-8`}
            >
              <div className="mb-5 flex items-center gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${feature.gradient} shadow-lg shadow-current/10`}>
                  <feature.icon className="h-5 w-5 text-white" strokeWidth={2} />
                </div>
                <h3 className="text-lg font-bold">{feature.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

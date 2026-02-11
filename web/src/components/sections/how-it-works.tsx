import { Zap, Route, Shield, ArrowRight, Check } from 'lucide-react'

const STEPS = [
  {
    icon: Zap,
    title: 'Intercept',
    description: 'Magnee detects your payment intent on any dApp. No integration needed — it wraps your wallet provider.',
    color: 'from-amber-400 to-orange-500',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    number: '01',
  },
  {
    icon: Route,
    title: 'Route',
    description: 'Find the cheapest cross-chain path via Li.Fi. Pay with whatever token you have, wherever it lives.',
    color: 'from-blue-400 to-cyan-500',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    number: '02',
  },
  {
    icon: Shield,
    title: 'Execute',
    description: 'Your wallet stays msg.sender on the destination chain via EIP-7702 delegation. No new accounts, no asset migration.',
    color: 'from-emerald-400 to-teal-500',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    number: '03',
  },
] as const

export function HowItWorks() {
  return (
    <section className="relative -mt-32 px-6 pt-48 pb-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-20 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">How It Works</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Three steps. One transaction.
          </h2>
        </div>

        <div className="relative grid gap-6 sm:grid-cols-3 sm:gap-4">
          {/* Connector lines (desktop) */}
          <div className="pointer-events-none absolute left-[33.3%] top-[4.5rem] hidden h-px w-[33.4%] bg-linear-to-r from-amber-500/30 via-blue-500/30 to-blue-500/30 sm:block" />
          <div className="pointer-events-none absolute left-[66.6%] top-[4.5rem] hidden h-px w-[33.4%] bg-linear-to-r from-blue-500/30 via-emerald-500/30 to-emerald-500/30 sm:block" />

          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className={`fade-up fade-up-d${i + 1} glass-card shine-on-hover group relative rounded-2xl p-8`}
            >
              {/* Number & Icon */}
              <div className="mb-8 flex items-center justify-between">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${step.iconBg}`}>
                  <step.icon className={`h-6 w-6 bg-linear-to-br ${step.color} bg-clip-text text-transparent`} strokeWidth={2} />
                </div>
                <span className={`bg-linear-to-br ${step.color} bg-clip-text text-5xl font-black text-transparent opacity-20`}>
                  {step.number}
                </span>
              </div>

              <h3 className="mb-3 text-xl font-bold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>

              {/* Arrow indicator */}
              {i < 2 && (
                <div className="mt-6 hidden items-center gap-2 text-xs text-muted-foreground/50 sm:flex">
                  <span>then</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              )}
              {i === 2 && (
                <div className="mt-6 hidden items-center gap-2 text-xs text-emerald-400/60 sm:flex">
                  <span className="flex items-center gap-1"><Check className="h-3 w-3" /> done</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

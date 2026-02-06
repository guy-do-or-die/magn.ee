import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowRight, Download, Sparkles } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      {/* Gradient orbs */}
      <div className="gradient-orb gradient-orb-1" />
      <div className="gradient-orb gradient-orb-2" />
      <div className="gradient-orb gradient-orb-3" />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Badge */}
        <div className="fade-up mb-8 inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/5 px-5 py-2.5 text-base backdrop-blur-sm">
          <span className="pulse-dot inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-primary/90">
            Powered by{' '}
            <a href="https://li.fi" target="_blank" rel="noopener" className="underline decoration-primary/30 hover:decoration-primary/80 transition-colors">LI.FI</a>,{' '}
            <a href="https://ens.domains" target="_blank" rel="noopener" className="underline decoration-primary/30 hover:decoration-primary/80 transition-colors">ENS</a> &{' '}
            <a href="https://eips.ethereum.org/EIPS/eip-7702" target="_blank" rel="noopener" className="underline decoration-primary/30 hover:decoration-primary/80 transition-colors">EIP-7702</a>
          </span>
          <Sparkles className="h-3.5 w-3.5 text-primary/60" />
        </div>

        {/* Headline */}
        <h1 className="fade-up fade-up-d1 text-5xl font-extrabold tracking-tighter sm:text-7xl lg:text-8xl">
          <span className="block">Pay from</span>
          <span className="relative inline-block">
            <span className="bg-linear-to-r from-blue-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent">
              any chain
            </span>
            {/* Underline decoration */}
            <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
              <path d="M2 8C50 2 100 2 150 6C200 10 250 4 298 8" stroke="url(#underline-grad)" strokeWidth="3" strokeLinecap="round" />
              <defs>
                <linearGradient id="underline-grad" x1="0" y1="0" x2="300" y2="0" >
                  <stop stopColor="#2B7AE8" />
                  <stop offset="0.5" stopColor="#EE4040" />
                  <stop offset="1" stopColor="#2B7AE8" />
                </linearGradient>
              </defs>
            </svg>
          </span>
        </h1>

        {/* Subtitle */}
        <p className="fade-up fade-up-d2 mx-auto mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Magnee intercepts your blockchain payments and routes them cross-chain.{' '}
          <span className="text-foreground/90">No bridging. No swapping. Just pay.</span>
        </p>

        {/* CTAs */}
        <div className="fade-up fade-up-d3 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild className="glow-btn gap-2 rounded-full px-8">
            <a href="#download">
              <Download className="h-4 w-4" />
              Get Extension
            </a>
          </Button>
          <Button variant="outline" size="lg" asChild className="gap-2 rounded-full px-8">
            <Link to="/explorer">
              Explore Transactions
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Trust signals */}
        <div className="fade-up fade-up-d4 mt-10 flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Open Source
          </span>
          <span className="h-3 w-px bg-border" />
          <span>Chrome & Brave</span>
          <span className="h-3 w-px bg-border" />
          <span>Free Forever</span>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-t from-background to-transparent" />
    </section>
  )
}

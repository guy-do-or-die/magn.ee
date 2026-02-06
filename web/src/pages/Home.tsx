import { Hero } from '@/components/sections/hero'
import { HowItWorks } from '@/components/sections/how-it-works'
import { Features } from '@/components/sections/features'
import { Chains } from '@/components/sections/chains'

export function Home() {
  return (
    <div className="page-enter">
      <Hero />
      <HowItWorks />
      <Features />
      <Chains />
    </div>
  )
}

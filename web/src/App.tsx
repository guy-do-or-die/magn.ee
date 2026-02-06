import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ThemeProvider } from '@/components/theme-provider'
import { Header } from '@/components/sections/header'
import { Footer } from '@/components/sections/footer'
import { Home } from '@/pages/Home'
import { Explorer } from '@/pages/Explorer'
import { wagmiConfig } from '@/lib/wagmi'

const queryClient = new QueryClient()

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <div className="noise-overlay relative flex min-h-screen flex-col">
              {/* Ambient gradient background */}
              <div className="ambient-bg" />

              <Header />
              <main className="relative z-10 flex-1">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/explorer" element={<Explorer />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

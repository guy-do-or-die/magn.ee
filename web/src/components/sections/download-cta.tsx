import { Button } from '@magnee/ui/components/button'
import { Download, Chrome } from 'lucide-react'

export function DownloadCTA() {
  return (
    <section id="download" className="relative px-6 py-32">
      <div className="section-divider mb-32" />
      <div className="mx-auto max-w-3xl">
        <div className="gradient-border overflow-hidden rounded-3xl">
          <div className="glass-card rounded-3xl p-1">
            <div className="relative overflow-hidden rounded-[calc(1.5rem-4px)] bg-linear-to-br from-primary/8 via-transparent to-primary/5 p-12 text-center sm:p-16">
              {/* Glow */}
              <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 bg-primary/10 blur-[80px]" />

              <div className="relative">
                <img src="/logo.svg" alt="Magnee" className="mx-auto mb-6 h-16 w-auto" />
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Get Magnee</h2>
                <p className="mx-auto mt-4 max-w-md text-muted-foreground">
                  Install the browser extension and start paying from any chain.
                  Open source, free, and privacy-preserving.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button size="lg" className="glow-btn gap-2 rounded-full px-8" asChild>
                    <a href="https://github.com/guy-do-or-die/magn.ee/releases/latest" target="_blank" rel="noopener">
                      <Chrome className="h-4 w-4" />
                      Latest Release
                    </a>
                  </Button>
                  <Button variant="outline" size="lg" className="gap-2 rounded-full px-8" asChild>
                    <a href="https://github.com/guy-do-or-die/magn.ee/releases/latest/download/magnee-extension.zip">
                      <Download className="h-4 w-4" />
                      Download .zip
                    </a>
                  </Button>
                </div>
                <p className="mt-5 text-xs text-muted-foreground/60">Chrome • Brave • Edge • Arc</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

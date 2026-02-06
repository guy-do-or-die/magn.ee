import { Separator } from '@/components/ui/separator'
import { Github } from 'lucide-react'

const GITHUB_URL = 'https://github.com/guy-do-or-die/magn.ee'

export function Footer() {
  return (
    <footer className="border-t border-border/30 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2 text-sm">
            <img src="/logo.svg" alt="Magnee" className="h-5 w-auto" />
            <span className="font-semibold">magnee</span>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <span className="text-muted-foreground">Pay from any chain</span>
          </div>

          <div className="flex items-center gap-4">
            <a href={GITHUB_URL} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground">
              <Github className="h-3.5 w-3.5" />
              Source
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

import { Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from '@/components/theme-toggle'
import { Github } from 'lucide-react'

const GITHUB_URL = 'https://github.com/guy-do-or-die/magn.ee'

export function Header() {
  const { pathname } = useLocation()

  return (
    <header className="fixed top-0 z-50 w-full">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="group flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <img src="/logo.svg" alt="Magnee" className="h-7 w-auto transition-transform duration-300 group-hover:scale-110" />
          <span className="bg-linear-to-r from-foreground to-foreground/80 bg-clip-text">magnee</span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-border/50 bg-background/60 px-1 py-1 backdrop-blur-xl sm:flex">
          <NavLink to="/" active={pathname === '/'}>Home</NavLink>
          <NavLink to="/explorer" active={pathname === '/explorer'}>Explorer</NavLink>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/explorer"
            className="glow-btn hidden items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
          >
            Explore Txs
          </Link>
        </div>
      </div>
    </header>
  )
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  )
}

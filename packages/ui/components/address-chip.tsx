import * as React from 'react'
import { Copy, ExternalLink, Check } from 'lucide-react'
import { cn, shortenAddress } from '../lib/utils'

export interface AddressChipProps {
  /** Full hex address */
  address: string
  /** Number of characters to show on each side (default 4 → 0xAbCd…1234) */
  chars?: number
  /** Block explorer base URL (e.g. https://basescan.org). If set, address becomes a link */
  explorerUrl?: string
  /** Show copy-to-clipboard button (default true) */
  copyable?: boolean
  /** Extra label before the address (e.g. "To", "From") */
  label?: string
  /** Additional class names */
  className?: string
}

/**
 * Compact address display with optional explorer link and copy button.
 * 
 * Usage:
 *   <AddressChip address="0xA9A1..." explorerUrl="https://basescan.org" />
 *   <AddressChip address="0xA9A1..." label="To" chars={6} />
 */
export function AddressChip({
  address,
  chars = 4,
  explorerUrl,
  copyable = true,
  label,
  className,
}: AddressChipProps) {
  const [copied, setCopied] = React.useState(false)

  const short = shortenAddress(address, chars)
  const href = explorerUrl ? `${explorerUrl}/address/${address}` : undefined

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted',
        className,
      )}
    >
      {label && <span className="font-sans text-muted-foreground/70 font-medium">{label}</span>}
      <span>{short}</span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="inline-flex shrink-0 cursor-pointer text-muted-foreground/50 hover:text-foreground transition-colors"
          title="Copy address"
        >
          {copied
            ? <Check className="h-3 w-3 text-emerald-400" />
            : <Copy className="h-3 w-3" />
          }
        </button>
      )}
      {href && <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />}
    </span>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="no-underline">
        {content}
      </a>
    )
  }

  return content
}

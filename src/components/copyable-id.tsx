import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Copy, Check } from 'lucide-react'

/** Visar ett trunkerat UUID som kopieras vid klick. */
export function CopyableId({
  id,
  className,
  prefix,
}: {
  id: string | null | undefined
  className?: string
  prefix?: string
}) {
  const [copied, setCopied] = useState(false)
  if (!id) return null

  const short = id.length > 14 ? `${id.slice(0, 7)}…${id.slice(-5)}` : id

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // klippbordet ej tillgängligt — ignorera
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={id}
      aria-label={`Kopiera ${prefix ? prefix + ' ' : ''}UUID ${id}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-mono text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <span className="truncate">{short}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
    </button>
  )
}

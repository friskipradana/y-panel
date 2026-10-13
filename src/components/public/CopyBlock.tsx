import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyTextToClipboard } from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'

interface CopyBlockProps {
  text: string
  /** Shown above the code, optional */
  label?: string
  /** Wrap long lines instead of scrolling (configs, URLs) */
  wrap?: boolean
}

// Code snippet with a copy button; works on plain http too (clipboard fallback).
export function CopyBlock({ text, label, wrap = false }: CopyBlockProps) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      if (await copyTextToClipboard(text)) setCopied(true)
    } catch {
      // clipboard blocked: the text stays selectable in the block
    }
  }

  return (
    <div className="min-w-0">
      {label ? <div className="mb-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)]">{label}</div> : null}
      <div className="flex items-stretch gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-2">
        <pre
          className={`panel-mono custom-widget-scrollbar min-w-0 flex-1 px-1.5 py-1 text-[0.75rem] leading-relaxed text-[var(--win-text)] ${
            wrap ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto whitespace-pre'
          }`}
        >
          {text}
        </pre>
        <Button variant="ghost" onClick={copy} className="shrink-0 self-start" aria-live="polite">
          {copied ? <Check size={13} className="text-[var(--panel-success-text)]" /> : <Copy size={13} />}
          <span>{copied ? t('public.copied') : t('public.copy')}</span>
        </Button>
      </div>
    </div>
  )
}

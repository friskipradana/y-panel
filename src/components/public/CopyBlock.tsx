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
  /** Shell prompt shown before a single-line command (not copied) */
  prompt?: string
}

// Code snippet with a copy button; works on plain http too (clipboard fallback).
export function CopyBlock({ text, label, wrap = false, prompt }: CopyBlockProps) {
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

  const multiline = text.includes('\n')

  return (
    <div className="min-w-0">
      {label ? <div className="mb-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)]">{label}</div> : null}
      <div className={`flex gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-2 max-sm:flex-col ${multiline ? 'sm:items-start' : 'sm:items-center'}`}>
        <div className="flex min-w-0 flex-1 items-baseline gap-1">
          {prompt ? (
            <span aria-hidden="true" className="panel-mono select-none pl-1.5 text-[0.8125rem] text-[var(--panel-info-text)]">
              {prompt}
            </span>
          ) : null}
          <pre
          className={`panel-mono custom-widget-scrollbar min-w-0 flex-1 px-1.5 py-1 text-[0.8125rem] leading-relaxed text-[var(--win-text)] ${
            wrap ? 'whitespace-pre-wrap break-words' : 'max-sm:whitespace-pre-wrap max-sm:break-words sm:overflow-x-auto sm:whitespace-pre'
          }`}
        >
            {text}
          </pre>
        </div>
        <Button variant="ghost" onClick={copy} className="shrink-0 max-sm:w-full max-sm:justify-center" aria-live="polite">
          {copied ? <Check size={13} className="text-[var(--panel-success-text)]" /> : <Copy size={13} />}
          <span>{copied ? t('public.copied') : t('public.copy')}</span>
        </Button>
      </div>
    </div>
  )
}

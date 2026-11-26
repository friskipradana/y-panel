import { useState } from 'react'
import { Check, Copy, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

interface KvmManualCommandProps {
  command: string
  t: (key: string) => string
  onOpenTerminal: () => void
}

export function KvmManualCommand({ command, t, onOpenTerminal }: KvmManualCommandProps) {
  const [showManualCmd, setShowManualCmd] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyCommand = () => {
    void navigator.clipboard.writeText(command)
    setCopied(true)
    toast.success(t('kvm.cmdCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setShowManualCmd((v) => !v)}
        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--win-text)] underline cursor-pointer"
      >
        {showManualCmd ? t('kvm.hideManualCmd') : t('kvm.showManualCmd')}
      </button>

      {showManualCmd ? (
        <div className="flex flex-col gap-1.5 mt-2 p-2 rounded border border-[var(--win-border)] bg-[var(--panel-surface-strong)]">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-[var(--win-text)]">
            <span className="truncate select-all">{command}</span>
            <IconButton label={t('kvm.copyCmd')} onClick={copyCommand}>
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--panel-success-text)]" /> : <Copy className="h-3.5 w-3.5" />}
            </IconButton>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" icon={<Terminal className="h-3 w-3" />} onClick={onOpenTerminal}>
              {t('kvm.openTerminal')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

import { Check, Copy, Monitor, MonitorOff, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import type { WindowKind } from '@/types'

interface KvmEmptyStateProps {
  kind: 'token-invalid' | 'disabled' | 'not-installed' | 'not-running'
  standalone?: boolean
  port: number
  exampleCommand: string
  copied: boolean
  kvmActionError: string
  installing: boolean
  starting: boolean
  t: (key: string, params?: Record<string, string | number>) => string
  onBack?: () => void
  onOpenWindow: (kind: WindowKind) => void
  onInstall: () => void
  onStart: () => void
  onRetry: () => void
  onCopyCommand: (cmd: string) => void
}

export function KvmEmptyState({
  kind,
  standalone,
  port,
  exampleCommand,
  copied,
  kvmActionError,
  installing,
  starting,
  t,
  onBack,
  onOpenWindow,
  onInstall,
  onStart,
  onRetry,
  onCopyCommand,
}: KvmEmptyStateProps) {
  if (kind === 'token-invalid') {
    return (
      <div className="kvm-empty">
        <ShieldAlert className="h-10 w-10 text-[var(--panel-danger-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.tokenInvalidTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.tokenInvalidDesc')}</p>
        {onBack ? (
          <Button variant="primary" size="sm" onClick={onBack}>{t('kvm.backToPanel')}</Button>
        ) : null}
      </div>
    )
  }

  if (kind === 'disabled') {
    return (
      <div className="kvm-empty">
        <MonitorOff className="h-10 w-10 text-[var(--panel-warning-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.disabledTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.disabledDesc')}</p>
        {standalone && onBack ? (
          <Button variant="primary" size="sm" onClick={onBack}>{t('kvm.backToPanel')}</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => onOpenWindow('settings')}>{t('kvm.openSettings')}</Button>
        )}
      </div>
    )
  }

  if (kind === 'not-installed') {
    return (
      <div className="kvm-empty">
        <MonitorOff className="h-10 w-10 text-[var(--panel-warning-text)] mb-3" strokeWidth={1.5} />
        <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.notInstalledTitle')}</h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{t('kvm.notInstalledDesc')}</p>
        {kvmActionError ? (
          <div className="panel-error-state !min-h-0 max-w-lg w-full !py-2 !px-3 mb-3 text-[11px]" role="alert">
            <span className="font-mono break-all select-text">{kvmActionError}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" loading={installing} disabled={installing} onClick={onInstall}>
            {installing ? t('kvm.installing') : t('kvm.installBtn')}
          </Button>
          {standalone && onBack ? (
            <Button variant="outline" size="sm" onClick={onBack}>{t('kvm.backToPanel')}</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onOpenWindow('settings')}>{t('kvm.openSettings')}</Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="kvm-empty">
      <Monitor className="h-10 w-10 text-[var(--text-secondary)] mb-3" strokeWidth={1.5} />
      <h3 className="text-sm font-semibold text-[var(--win-text)] mb-1">{t('kvm.notRunningTitle')}</h3>
      <p className="text-xs text-[var(--text-secondary)] max-w-md mb-2">{t('kvm.notRunningDesc', { port })}</p>

      <div className="kvm-code-box">
        <span className="truncate select-all font-mono">{exampleCommand}</span>
        <IconButton label={t('kvm.copyCmd')} onClick={() => onCopyCommand(exampleCommand)}>
          {copied ? <Check className="h-3.5 w-3.5 text-[var(--panel-success-text)]" /> : <Copy className="h-3.5 w-3.5" />}
        </IconButton>
      </div>

      {kvmActionError ? (
        <div className="panel-error-state !min-h-0 max-w-lg w-full !py-2 !px-3 mt-2 text-[11px]" role="alert">
          <span className="font-mono break-all select-text">{kvmActionError}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 mt-2">
        <Button variant="primary" size="sm" loading={starting} disabled={starting} onClick={onStart}>
          {starting ? t('kvm.startingService') : t('kvm.startService')}
        </Button>
        <Button variant="outline" size="sm" onClick={onRetry}>{t('kvm.retry')}</Button>
        {standalone && onBack ? (
          <Button variant="outline" size="sm" onClick={onBack}>{t('kvm.backToPanel')}</Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onOpenWindow('host-terminal')}>{t('kvm.openTerminal')}</Button>
        )}
      </div>
    </div>
  )
}

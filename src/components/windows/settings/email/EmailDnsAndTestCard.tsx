import { Check, CloudUpload, Copy, Globe, RefreshCw, Send } from 'lucide-react'
import { useState } from 'react'
import type { EmailDNSRecord } from '@/api/email'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useI18n } from '@/lib/i18n'

interface EmailDnsAndTestCardProps {
  records: EmailDNSRecord[]
  cloudflareReady: boolean
  isDirty: boolean
  syncingDns: boolean
  testing: boolean
  refreshing: boolean
  onSyncDns: () => void
  onRefresh: () => void
  onTest: (to?: string) => void
}

export function EmailDnsAndTestCard({
  records,
  cloudflareReady,
  isDirty,
  syncingDns,
  testing,
  refreshing,
  onSyncDns,
  onRefresh,
  onTest,
}: EmailDnsAndTestCardProps) {
  const { t } = useI18n()
  const [testTo, setTestTo] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(index)
      window.setTimeout(() => setCopiedIdx((curr) => (curr === index ? null : curr)), 1600)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Globe />}
        title={t('email.settings.dnsTitle')}
        subtitle={t('email.settings.dnsSubtitle')}
        tone="primary"
        className="mb-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={refreshing}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={onRefresh}
            >
              {t('email.settings.dnsVerifyBtn')}
            </Button>
            {cloudflareReady && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDirty || records.length === 0}
                loading={syncingDns}
                icon={<CloudUpload className="h-3.5 w-3.5" />}
                onClick={onSyncDns}
              >
                {t('email.settings.dnsSyncBtn')}
              </Button>
            )}
          </div>
        }
      />

      {records.length === 0 ? (
        <p className="panel-muted-block px-3 py-2.5 text-[0.75rem] text-[var(--text-secondary)]">
          {t('email.settings.dnsEmptyHint')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--win-border)]">
          <table className="w-full border-collapse text-left text-[0.75rem]">
            <thead>
              <tr className="border-b border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
                <th className="px-2.5 py-2 font-semibold">{t('email.dns.colType')}</th>
                <th className="px-2.5 py-2 font-semibold">{t('email.dns.colName')}</th>
                <th className="px-2.5 py-2 font-semibold">{t('email.dns.colValue')}</th>
                <th className="px-2.5 py-2 font-semibold">{t('email.dns.colStatus')}</th>
                <th className="px-2.5 py-2 text-right font-semibold">{t('common.copy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--win-border)]">
              {records.map((rec, idx) => (
                <tr key={`${rec.type}-${rec.name}-${rec.content}`} className="hover:bg-[var(--panel-surface-hover)]">
                  <td className="px-2.5 py-2">
                    <Badge tone="info" className="panel-mono">
                      {rec.type}
                    </Badge>
                  </td>
                  <td className="px-2.5 py-2 font-mono text-[var(--win-text)]">{rec.name}</td>
                  <td className="max-w-[320px] truncate px-2.5 py-2 font-mono text-[var(--text-secondary)]" title={rec.content}>
                    {rec.priority ? `[${rec.priority}] ` : ''}
                    {rec.content}
                  </td>
                  <td className="px-2.5 py-2">
                    <Badge
                      tone={rec.status === 'verified' ? 'success' : rec.status === 'missing' ? 'warning' : 'neutral'}
                      dot
                    >
                      {rec.status === 'verified'
                        ? t('email.dns.statusVerified')
                        : rec.status === 'missing'
                          ? t('email.dns.statusMissing')
                          : t('email.dns.statusPending')}
                    </Badge>
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <IconButton
                      label={t('common.copy')}
                      onClick={() => void handleCopy(rec.content, idx)}
                    >
                      {copiedIdx === idx ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-[var(--win-border)] pt-3">
        <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label={t('email.settings.testToLabel')} hint={t('email.settings.testToHint')}>
              <TextInput
                mono
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder={t('email.ph.testTo')}
              />
            </Field>
          </div>
          <Button
            type="button"
            variant="outline"
            size="md"
            disabled={isDirty}
            loading={testing}
            icon={<Send className="h-3.5 w-3.5" />}
            onClick={() => onTest(testTo.trim() || undefined)}
          >
            {testTo.trim() ? t('email.settings.sendTestBtn') : t('email.settings.testConnBtn')}
          </Button>
        </div>
        {isDirty && (
          <p className="mt-1.5 text-[0.75rem] text-[var(--panel-warning-text)]">
            {t('settings.payment.saveBeforeTest')}
          </p>
        )}
      </div>
    </div>
  )
}

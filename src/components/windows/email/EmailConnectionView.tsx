import { Check, Copy, Globe, Server } from 'lucide-react'
import { useState } from 'react'
import type { EmailOverviewResponse } from '@/api/email'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useI18n } from '@/lib/i18n'

interface EmailConnectionViewProps {
  overview: EmailOverviewResponse | undefined
}

export function EmailConnectionView({ overview }: EmailConnectionViewProps) {
  const { t } = useI18n()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1600)
    } catch {
      // ignore clipboard errors
    }
  }

  const mailHost =
    overview?.mailHostname ||
    (overview?.domain ? `mail.${overview.domain}` : overview?.smtpHost || '127.0.0.1')

  const params = [
    {
      key: 'method',
      label: t('email.settings.methodLabel'),
      value:
        overview?.method === 'ip'
          ? t('email.settings.methodIp')
          : t('email.settings.methodCloudflare'),
    },
    {
      key: 'domain',
      label: t('email.settings.domainLabel'),
      value: overview?.domain || '-',
    },
    {
      key: 'mailHost',
      label: t('email.settings.mailHostnameLabel'),
      value: mailHost,
    },
    {
      key: 'imap',
      label: 'IMAP (SSL/TLS)',
      value: `${mailHost}:${overview?.imapPort ?? 993}`,
    },
    {
      key: 'submission',
      label: 'SMTP Submission (STARTTLS)',
      value: `${mailHost}:${overview?.submissionPort ?? 587}`,
    },
    {
      key: 'smtps',
      label: 'SMTPS (Implicit TLS)',
      value: `${mailHost}:${overview?.smtpsPort ?? 465}`,
    },
  ]

  const records = overview?.dnsRecords ?? []

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-4">
      <div className="panel-shell-card settings-card flex flex-col !p-3.5 !gap-3.5">
        <SectionHeader
          icon={<Server />}
          title={t('email.conn.clientTitle')}
          subtitle={t('email.conn.clientSubtitle')}
          tone="primary"
          className="mb-0"
        />

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {params.map((item) => (
            <div
              key={item.key}
              className="panel-muted-block flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[0.75rem] text-[var(--text-secondary)]">{item.label}</p>
                <p className="truncate font-mono text-[0.8125rem] font-semibold text-[var(--win-text)]">
                  {item.value}
                </p>
              </div>
              {item.value !== '-' && (
                <IconButton
                  label={t('common.copy')}
                  onClick={() => void handleCopy(item.value, item.key)}
                >
                  {copiedKey === item.key ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel-shell-card settings-card flex flex-col !p-3.5 !gap-3.5">
        <SectionHeader
          icon={<Globe />}
          title={t('email.settings.dnsTitle')}
          subtitle={t('email.settings.dnsSubtitle')}
          tone="primary"
          className="mb-0"
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
                {records.map((rec, idx) => {
                  const copyKey = `dns-${idx}`
                  return (
                    <tr
                      key={`${rec.type}-${rec.name}-${rec.content}`}
                      className="hover:bg-[var(--panel-surface-hover)]"
                    >
                      <td className="px-2.5 py-2">
                        <Badge tone="info" className="panel-mono">
                          {rec.type}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[var(--win-text)]">{rec.name}</td>
                      <td
                        className="max-w-[340px] truncate px-2.5 py-2 font-mono text-[var(--text-secondary)]"
                        title={rec.content}
                      >
                        {rec.priority ? `[${rec.priority}] ` : ''}
                        {rec.content}
                      </td>
                      <td className="px-2.5 py-2">
                        <Badge
                          tone={
                            rec.status === 'verified'
                              ? 'success'
                              : rec.status === 'missing'
                                ? 'warning'
                                : 'neutral'
                          }
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
                          onClick={() => void handleCopy(rec.content, copyKey)}
                        >
                          {copiedKey === copyKey ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </IconButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, KeyRound, Plus, RefreshCw, ShieldAlert, ShieldBan, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  addSSHKey,
  applyOSUpdates,
  deleteSSHKey,
  fail2BanBanIP,
  fail2BanUnbanIP,
  getSecurityHardening,
} from '@/api/security'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { Modal } from '@/components/ui/Modal'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

export function HardeningSection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [addKeyOpen, setAddKeyOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [banIPByJail, setBanIPByJail] = useState<Record<string, string>>({})
  const [upgradeOutput, setUpgradeOutput] = useState('')

  const q = useQuery({
    queryKey: ['security-hardening'],
    queryFn: getSecurityHardening,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['security-hardening'] })

  const addKeyMut = useMutation({
    mutationFn: () => addSSHKey(keyDraft.trim()),
    onSuccess: () => {
      toast.success(t('hardening.sshKeyAdded'))
      setKeyDraft('')
      setAddKeyOpen(false)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const delKeyMut = useMutation({
    mutationFn: (id: string) => deleteSSHKey(id),
    onSuccess: () => {
      toast.success(t('hardening.sshKeyDeleted'))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const banMut = useMutation({
    mutationFn: ({ jail, ip }: { jail: string; ip: string }) => fail2BanBanIP(jail, ip),
    onSuccess: (_, vars) => {
      toast.success(t('hardening.ipBanned', { ip: vars.ip }))
      setBanIPByJail((prev) => ({ ...prev, [vars.jail]: '' }))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unbanMut = useMutation({
    mutationFn: ({ jail, ip }: { jail: string; ip: string }) => fail2BanUnbanIP(jail, ip),
    onSuccess: (_, vars) => {
      toast.success(t('hardening.ipUnbanned', { ip: vars.ip }))
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const upgradeMut = useMutation({
    mutationFn: applyOSUpdates,
    onSuccess: (res) => {
      toast.success(t('hardening.upgradeDone'))
      setUpgradeOutput(res.output || '')
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (q.isLoading) {
    return (
      <div className="p-6 flex-1">
        <LoadingState>{t('hardening.loading')}</LoadingState>
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="p-6 flex-1">
        <ErrorState
          title={t('hardening.loadFailed')}
          hint={(q.error as Error)?.message}
          action={
            <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
              {t('common.refresh')}
            </Button>
          }
        />
      </div>
    )
  }

  const data = q.data!

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-4">
      <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
        <SectionHeader
          icon={<KeyRound />}
          title={t('hardening.sshKeysTitle')}
          subtitle={data.sshKeysPath}
          tone="primary"
          className="mb-0"
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="primary-soft"
                icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
                onClick={() => setAddKeyOpen(true)}
              >
                {t('hardening.addSshKey')}
              </Button>
              <IconButton size="sm" variant="outline" label={t('common.refresh')} onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            </div>
          }
        />
        {data.sshKeys.length === 0 ? (
          <EmptyState icon={<KeyRound />}>{t('hardening.emptySshKeys')}</EmptyState>
        ) : (
          <div className="space-y-1.5">
            {data.sshKeys.map((k) => (
              <EntityRow
                key={k.id}
                centered
                leading={<ListRowIcon><KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                title={k.comment || k.id}
                badges={<Badge tone="neutral">{k.type}</Badge>}
                subtitle={<span className="panel-mono">{k.fingerprint}</span>}
                actions={
                  <IconButton
                    size="sm"
                    variant="ghost"
                    tone="danger"
                    label={t('common.delete')}
                    onClick={async () => {
                      const ok = await alertLib.confirm(
                        t('hardening.deleteKeyTitle'),
                        t('hardening.deleteKeyConfirm', { name: k.comment || k.fingerprint }),
                        t('common.delete'),
                        t('common.cancel'),
                        'warning',
                        'firewall',
                      )
                      if (ok) delKeyMut.mutate(k.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
        <SectionHeader
          icon={<ShieldBan />}
          title={t('hardening.fail2banTitle')}
          tone="warning"
          className="mb-0"
          actions={
            <Badge tone={data.fail2ban.running ? 'success' : data.fail2ban.installed ? 'warning' : 'neutral'} dot>
              {data.fail2ban.running
                ? t('hardening.f2bRunning')
                : data.fail2ban.installed
                  ? t('hardening.f2bStopped')
                  : t('hardening.f2bMissing')}
            </Badge>
          }
        />

        {data.fail2ban.jails.length > 0 ? (
          <div className="space-y-2">
            {data.fail2ban.jails.map((j) => (
              <EntityRow
                key={j.name}
                title={<span className="panel-mono">{j.name}</span>}
                badges={
                  <>
                    <Badge tone={j.currentlyBanned > 0 ? 'warning' : 'success'} dot>
                      {t('hardening.bannedCount', { count: j.currentlyBanned })}
                    </Badge>
                    <Badge tone="neutral">{t('hardening.totalBanned', { count: j.totalBanned })}</Badge>
                  </>
                }
                actions={
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      mono
                      className="w-36"
                      value={banIPByJail[j.name] ?? ''}
                      onChange={(e) => setBanIPByJail((prev) => ({ ...prev, [j.name]: e.target.value }))}
                      placeholder={t('hardening.banIpPlaceholder')}
                    />
                    <Button
                      variant="danger"
                      disabled={!(banIPByJail[j.name] ?? '').trim()}
                      loading={banMut.isPending}
                      onClick={() => banMut.mutate({ jail: j.name, ip: (banIPByJail[j.name] ?? '').trim() })}
                    >
                      {t('hardening.banBtn')}
                    </Button>
                  </div>
                }
                description={
                  j.bannedIps.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {j.bannedIps.map((ip) => (
                        <Button
                          key={ip}
                          size="sm"
                          variant="outline"
                          icon={<X className="h-3 w-3" strokeWidth={1.75} />}
                          title={t('hardening.unbanHint')}
                          onClick={() => unbanMut.mutate({ jail: j.name, ip })}
                        >
                          <span className="panel-mono">{ip}</span>
                        </Button>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {t('hardening.f2bHint')}
          </p>
        )}

        {data.failedLogins.length > 0 ? (
          <div className="space-y-1.5 border-t border-[var(--win-border)] pt-2.5">
            <p className="panel-section-label">{t('hardening.failedLoginsTitle')}</p>
            <pre className="panel-mono max-h-40 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
              {data.failedLogins.join('\n')}
            </pre>
          </div>
        ) : null}
      </section>

      <section className="panel-shell-card settings-card flex flex-col gap-3 p-3.5">
        <SectionHeader
          icon={<ShieldAlert />}
          title={t('hardening.osUpdatesTitle')}
          tone="info"
          className="mb-0"
          actions={
            <div className="flex items-center gap-1.5">
              <Badge tone={data.upgradable.length > 0 ? 'warning' : 'success'} dot>
                {t('hardening.upgradableCount', { count: data.upgradable.length })}
              </Badge>
              {data.packageManager === 'apt' && data.upgradable.length > 0 ? (
                <Button
                  size="sm"
                  variant="primary-soft"
                  icon={<Download className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  loading={upgradeMut.isPending}
                  onClick={async () => {
                    const ok = await alertLib.confirm(
                      t('hardening.upgradeConfirmTitle'),
                      t('hardening.upgradeConfirmMessage', { count: data.upgradable.length }),
                      t('hardening.applyUpdates'),
                      t('common.cancel'),
                      'warning',
                      'firewall',
                    )
                    if (ok) upgradeMut.mutate()
                  }}
                >
                  {t('hardening.applyUpdates')}
                </Button>
              ) : null}
            </div>
          }
        />

        {data.upgradable.length === 0 ? (
          <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {data.packageManager ? t('hardening.osUpToDate') : t('hardening.osLinuxOnly')}
          </p>
        ) : (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {data.upgradable.map((p) => (
              <li
                key={p.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] px-3 py-1.5 text-[0.75rem]"
              >
                <span className="panel-mono font-semibold text-[var(--win-text)] truncate">{p.name}</span>
                <span className="panel-mono text-[var(--text-secondary)] shrink-0">{p.version}</span>
              </li>
            ))}
          </ul>
        )}

        {upgradeOutput ? (
          <pre className="panel-mono max-h-44 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
            {upgradeOutput}
          </pre>
        ) : null}
      </section>

      <Modal
        open={addKeyOpen}
        onClose={() => setAddKeyOpen(false)}
        title={t('hardening.addSshKeyTitle')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddKeyOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!keyDraft.trim()} loading={addKeyMut.isPending} onClick={() => addKeyMut.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('hardening.sshKeyInputLabel')} hint={t('hardening.sshKeyInputHint')}>
          <Textarea mono rows={4} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}

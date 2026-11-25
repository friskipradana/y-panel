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
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
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
      <div className="p-4 flex-1">
        <LoadingState>{t('hardening.loading')}</LoadingState>
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="p-4 flex-1">
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
    <div className="p-3.5 space-y-4 overflow-y-auto flex-1">
      {/* 1. SSH Authorized Keys */}
      <section className="settings-card space-y-2.5">
        <SectionHeader
          icon={<KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />}
          title={t('hardening.sshKeysTitle')}
          subtitle={data.sshKeysPath}
          actions={
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="primary-soft" onClick={() => setAddKeyOpen(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('hardening.addSshKey')}</span>
              </Button>
              <IconButton size="sm" variant="ghost" label={t('common.refresh')} onClick={refresh}>
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
              <div
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold text-[var(--win-text)]">{k.comment || k.id}</span>
                    <Badge tone="neutral">{k.type}</Badge>
                  </div>
                  <p className="panel-mono text-[11px] text-[var(--text-secondary)] truncate">{k.fingerprint}</p>
                </div>
                <IconButton
                  size="sm"
                  variant="ghost"
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
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Fail2Ban & SSH Login Attempts */}
      <section className="settings-card space-y-3">
        <SectionHeader
          icon={<ShieldBan className="h-3.5 w-3.5" strokeWidth={1.75} />}
          title={t('hardening.fail2banTitle')}
          actions={
            <Badge tone={data.fail2ban.running ? 'success' : data.fail2ban.installed ? 'warning' : 'neutral'}>
              {data.fail2ban.running
                ? t('hardening.f2bRunning')
                : data.fail2ban.installed
                  ? t('hardening.f2bStopped')
                  : t('hardening.f2bMissing')}
            </Badge>
          }
        />

        {data.fail2ban.jails.length > 0 ? (
          <div className="space-y-2.5">
            {data.fail2ban.jails.map((j) => (
              <div key={j.name} className="rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="panel-mono text-[12.5px] font-semibold text-[var(--win-text)]">{j.name}</span>
                    <Badge tone={j.currentlyBanned > 0 ? 'warning' : 'success'}>
                      {t('hardening.bannedCount', { count: j.currentlyBanned })}
                    </Badge>
                    <span className="panel-mono text-[11px] text-[var(--text-secondary)]">
                      {t('hardening.totalBanned', { count: j.totalBanned })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      className="panel-input--mono w-36"
                      value={banIPByJail[j.name] ?? ''}
                      onChange={(e) => setBanIPByJail((prev) => ({ ...prev, [j.name]: e.target.value }))}
                      placeholder={t('hardening.banIpPlaceholder')}
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!(banIPByJail[j.name] ?? '').trim()}
                      loading={banMut.isPending}
                      onClick={() => banMut.mutate({ jail: j.name, ip: (banIPByJail[j.name] ?? '').trim() })}
                    >
                      {t('hardening.banBtn')}
                    </Button>
                  </div>
                </div>
                {j.bannedIps.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {j.bannedIps.map((ip) => (
                      <button
                        key={ip}
                        type="button"
                        className="panel-mono inline-flex items-center gap-1 rounded border border-[var(--win-border)] bg-[var(--panel-surface)] px-2 py-0.5 text-[11.5px] text-[var(--win-text)] hover:border-[var(--panel-danger-solid)]"
                        title={t('hardening.unbanHint')}
                        onClick={() => unbanMut.mutate({ jail: j.name, ip })}
                      >
                        <span>{ip}</span>
                        <X className="h-3 w-3 opacity-75" strokeWidth={1.75} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-secondary)]">{t('hardening.f2bHint')}</p>
        )}

        {data.failedLogins.length > 0 ? (
          <div className="space-y-1.5 pt-2 border-t border-[var(--win-border)]">
            <p className="panel-section-label">{t('hardening.failedLoginsTitle')}</p>
            <pre className="panel-mono max-h-40 overflow-y-auto rounded border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-2.5 text-[11px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
              {data.failedLogins.join('\n')}
            </pre>
          </div>
        ) : null}
      </section>

      {/* 3. OS Security Updates */}
      <section className="settings-card space-y-2.5">
        <SectionHeader
          icon={<ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} />}
          title={t('hardening.osUpdatesTitle')}
          actions={
            <div className="flex items-center gap-1.5">
              <Badge tone={data.upgradable.length > 0 ? 'warning' : 'success'}>
                {t('hardening.upgradableCount', { count: data.upgradable.length })}
              </Badge>
              {data.packageManager === 'apt' && data.upgradable.length > 0 ? (
                <Button
                  size="sm"
                  variant="primary-soft"
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
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>{t('hardening.applyUpdates')}</span>
                </Button>
              ) : null}
            </div>
          }
        />

        {data.upgradable.length === 0 ? (
          <p className="text-[12px] text-[var(--text-secondary)]">
            {data.packageManager ? t('hardening.osUpToDate') : t('hardening.osLinuxOnly')}
          </p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {data.upgradable.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 rounded border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] px-2.5 py-1 text-[11.5px]">
                <span className="panel-mono font-semibold text-[var(--win-text)] truncate">{p.name}</span>
                <span className="panel-mono text-[var(--text-secondary)] shrink-0">{p.version}</span>
              </div>
            ))}
          </div>
        )}

        {upgradeOutput ? (
          <pre className="panel-mono max-h-44 overflow-y-auto rounded border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-2.5 text-[11px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
            {upgradeOutput}
          </pre>
        ) : null}
      </section>

      <Modal open={addKeyOpen} onClose={() => setAddKeyOpen(false)} title={t('hardening.addSshKeyTitle')} size="md">
        <div className="space-y-3">
          <Field label={t('hardening.sshKeyInputLabel')} hint={t('hardening.sshKeyInputHint')}>
            <Textarea
              rows={4}
              className="panel-input--mono"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setAddKeyOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" disabled={!keyDraft.trim()} loading={addKeyMut.isPending} onClick={() => addKeyMut.mutate()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

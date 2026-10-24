import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, Save, ShieldCheck } from 'lucide-react'
import { getDatabaseAccess, setDatabaseAccess, type DatabaseAccessSettings } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { SelectableCard } from '@/components/ui/SelectableCard'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { toast } from 'sonner'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

const splitIps = (text: string) => text.split(/[\s,;]+/).filter(Boolean)

// Where the database may be reached from: this server only, or the listed addresses
export function AccessPanel({ databaseId }: { databaseId: number }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['database-access', databaseId], queryFn: () => getDatabaseAccess(databaseId), gcTime: 0 })
  if (query.isLoading) return <LoadingState>{t('databases.access.loading')}</LoadingState>
  if (query.isError || !query.data) return <ErrorState title={t('databases.access.loadFailed')} hint={apiError(query.error, t('databases.actionFailed'))} />
  return <AccessForm key={`${query.data.mode}:${query.data.ips.join(',')}`} databaseId={databaseId} current={query.data} onSaved={(next) => qc.setQueryData(['database-access', databaseId], next)} />
}

function AccessForm({ databaseId, current, onSaved }: { databaseId: number; current: DatabaseAccessSettings; onSaved: (next: DatabaseAccessSettings) => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [mode, setMode] = useState(current.mode)
  const [text, setText] = useState(current.ips.join('\n'))
  const ips = splitIps(text)
  const missing = mode === 'ips' && ips.length === 0
  const unchanged = mode === current.mode && (mode === 'local' || ips.join(',') === current.ips.join(','))

  const save = useMutation({
    mutationFn: () => setDatabaseAccess(databaseId, { mode, ips: mode === 'ips' ? ips : [] }),
    onSuccess: (next) => {
      onSaved(next)
      void qc.invalidateQueries({ queryKey: ['user-databases'] })
      toast.success(t('databases.access.saved'))
    },
    onError: (e: unknown) => alertLib.fire(t('databases.access.saveFailed'), apiError(e, t('databases.actionFailed')), 'error'),
  })

  const confirmAndSave = async () => {
    const ok = await alertLib.confirm(
      t('databases.access.confirmTitle'),
      mode === 'ips' ? t('databases.access.confirmIps', { count: ips.length }) : t('databases.access.confirmLocal'),
      t('databases.access.save'),
      t('common.cancel'),
      'warning',
    )
    if (ok) save.mutate()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t('databases.admin.tabAccess')}>
        <SelectableCard selected={mode === 'local'} onClick={() => setMode('local')} className="flex items-start gap-3 rounded-xl p-3 text-left">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--panel-success-text)]" strokeWidth={1.75} />
          <span>
            <span className="block text-[0.8125rem] font-semibold">{t('databases.access.local')}</span>
            <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('databases.access.localHint')}</span>
          </span>
        </SelectableCard>
        <SelectableCard selected={mode === 'ips'} onClick={() => setMode('ips')} className="flex items-start gap-3 rounded-xl p-3 text-left">
          <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
          <span>
            <span className="block text-[0.8125rem] font-semibold">{t('databases.access.ips')}</span>
            <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('databases.access.ipsHint', { port: current.port })}</span>
          </span>
        </SelectableCard>
      </div>

      {mode === 'ips' ? (
        <Field label={t('databases.access.ipsLabel')} htmlFor="db-access-ips" hint={t('databases.access.ipsFieldHint')} error={missing ? t('databases.access.ipsMissing') : undefined}>
          <Textarea id="db-access-ips" rows={4} value={text} invalid={missing} spellCheck={false} placeholder={'203.0.113.7\n10.0.0.0/24'} mono onChange={(e) => setText(e.target.value)} />
        </Field>
      ) : null}

      <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('databases.access.restartNote')}</p>
      <Button variant="primary" disabled={missing || unchanged} loading={save.isPending} onClick={() => void confirmAndSave()}>
        <Save className="h-3.5 w-3.5" />
        {t('databases.access.save')}
      </Button>
    </div>
  )
}

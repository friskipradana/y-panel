import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { getThresholds, resetThresholds, saveThresholds, type Detector } from '@/api/notify'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { TextInput } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const minutes = (sec: number) => String(Math.round(sec / 60))

interface Row {
  event: string
  levels: string[]
  window: string
  cooldown: string
  quiet: string
  minDistinct: string
}

const toRow = (d: Detector): Row => ({
  event: d.event,
  levels: d.levels.map(String),
  window: minutes(d.windowSec),
  cooldown: minutes(d.cooldownSec),
  quiet: minutes(d.quietSec),
  minDistinct: String(d.minDistinct),
})

const toDetector = (row: Row, base: Detector): Detector => ({
  ...base,
  levels: row.levels.map(Number),
  windowSec: Number(row.window) * 60,
  cooldownSec: Number(row.cooldown) * 60,
  quietSec: Number(row.quiet) * 60,
  minDistinct: Number(row.minDistinct),
})

// When an alert speaks: the thresholds and times of each detector. A single failure is never enough; these say how many.
export function ThresholdsTable() {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['notify', 'thresholds'], queryFn: getThresholds, retry: 0 })
  if (query.isLoading) return <LoadingState>{t('notify.thr.loading')}</LoadingState>
  if (query.isError || !query.data) return <ErrorState title={t('notify.thr.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
  // keyed by what was saved, so the form follows the agent after a save or a reset
  return <ThresholdsForm key={JSON.stringify(query.data.detectors)} detectors={query.data.detectors} />
}

function ThresholdsForm({ detectors }: { detectors: Detector[] }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [rows, setRows] = useState<Row[]>(() => detectors.map(toRow))
  const patch = (event: string, change: Partial<Row>) => setRows((current) => current.map((row) => (row.event === event ? { ...row, ...change } : row)))
  const dirty = JSON.stringify(rows) !== JSON.stringify(detectors.map(toRow))

  const numbersOk = rows.every((row) => [...row.levels, row.window, row.cooldown, row.quiet, row.minDistinct].every((v) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0))
  const risingOk = rows.every((row) => row.levels.every((v, i) => i === 0 || Number(v) > Number(row.levels[i - 1])))

  const done = (data: { detectors: Detector[] }) => qc.setQueryData(['notify', 'thresholds'], (old: object | undefined) => ({ ...(old ?? {}), detectors: data.detectors }))
  const save = useMutation({
    mutationFn: () => saveThresholds(rows.map((row) => toDetector(row, detectors.find((d) => d.event === row.event) as Detector))),
    onSuccess: (data) => {
      done(data)
      toast.success(t('notify.thr.saved'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.thr.saveFailed'))),
  })
  const reset = useMutation({
    mutationFn: resetThresholds,
    onSuccess: (data) => {
      done(data)
      toast.success(t('notify.thr.resetDone'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.thr.saveFailed'))),
  })
  const confirmReset = async () => {
    const ok = await alertLib.confirm(t('notify.thr.resetTitle'), t('notify.thr.resetMessage'), t('notify.thr.reset'), t('common.cancel'), 'warning', 'settings')
    if (ok) reset.mutate()
  }

  const levelLabels = [t('notify.thr.level1'), t('notify.thr.level2'), t('notify.thr.level3')]

  return (
    <div className="panel-shell-card flex flex-col gap-4 settings-card">
      <SectionHeader icon={<ShieldAlert />} title={t('notify.thr.title')} subtitle={t('notify.thr.subtitle')} />

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const base = detectors.find((d) => d.event === row.event) as Detector
          return (
            <section key={row.event} className="flex flex-col gap-2.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
              <div>
                <p className="text-[13px] font-semibold">{t(`notify.event.${row.event}`)}</p>
                <p className="text-[11.5px] text-[var(--text-secondary)]">{t(`notify.thr.desc.${row.event}`)}</p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {row.levels.map((value, i) => (
                  <label key={i} className="flex flex-col justify-end gap-1 text-[11.5px] text-[var(--text-secondary)]">
                    {levelLabels[i]} ({base.countDistinct ? t('notify.thr.unitNames') : t('notify.thr.unitEvents')})
                    <TextInput
                      mono
                      type="number"
                      min={1}
                      value={value}
                      invalid={value.trim() === '' || (i > 0 && Number(value) <= Number(row.levels[i - 1]))}
                      onChange={(e) => patch(row.event, { levels: row.levels.map((v, j) => (j === i ? e.target.value : v)) })}
                    />
                  </label>
                ))}
                <label className="flex flex-col justify-end gap-1 text-[11.5px] text-[var(--text-secondary)]">
                  {t('notify.thr.window')}
                  <TextInput mono type="number" min={1} value={row.window} onChange={(e) => patch(row.event, { window: e.target.value })} />
                </label>
                <label className="flex flex-col justify-end gap-1 text-[11.5px] text-[var(--text-secondary)]">
                  {t('notify.thr.cooldown')}
                  <TextInput mono type="number" min={1} value={row.cooldown} onChange={(e) => patch(row.event, { cooldown: e.target.value })} />
                </label>
                <label className="flex flex-col justify-end gap-1 text-[11.5px] text-[var(--text-secondary)]">
                  {t('notify.thr.quiet')}
                  <TextInput mono type="number" min={1} value={row.quiet} onChange={(e) => patch(row.event, { quiet: e.target.value })} />
                </label>
                {base.minDistinct > 0 ? (
                  <label className="flex flex-col justify-end gap-1 text-[11.5px] text-[var(--text-secondary)]">
                    {t('notify.thr.minDistinct')}
                    <TextInput mono type="number" min={0} value={row.minDistinct} onChange={(e) => patch(row.event, { minDistinct: e.target.value })} />
                  </label>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>

      {!risingOk ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{t('notify.thr.notRising')}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)] pt-3.5">
        <Button variant="ghost" loading={reset.isPending} onClick={() => void confirmReset()}>
          {t('notify.thr.reset')}
        </Button>
        <Button variant="primary" disabled={!dirty || !numbersOk || !risingOk} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

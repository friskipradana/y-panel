import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { getThresholds, resetThresholds, saveThresholds, type Detector } from '@/api/notify'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
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

interface CompactNumberInputProps {
  value: string
  unit?: string
  min?: number
  invalid?: boolean
  onChange: (val: string) => void
  ariaLabel?: string
}

function CompactNumberInput({
  value,
  unit,
  min = 1,
  invalid = false,
  onChange,
  ariaLabel,
}: CompactNumberInputProps) {
  return (
    <div
      className={`relative inline-flex items-center rounded-lg border bg-[var(--panel-field-bg)] transition-colors focus-within:border-[var(--focus-ring)] focus-within:ring-1 focus-within:ring-[var(--focus-ring)] ${
        invalid
          ? 'border-[var(--panel-danger-text)]'
          : 'border-[var(--win-border)] hover:border-[var(--win-border-hover,var(--win-border))]'
      }`}
    >
      <input
        type="number"
        min={min}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="panel-mono h-7 w-12 bg-transparent px-1.5 text-right text-[12px] text-[var(--win-text)] outline-none"
      />
      {unit ? (
        <span className="select-none pr-1.5 text-[10.5px] text-[var(--text-secondary)]">
          {unit}
        </span>
      ) : null}
    </div>
  )
}

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
    <div className="panel-shell-card flex flex-col gap-3.5 settings-card !p-3.5">
      <SectionHeader icon={<ShieldAlert />} title={t('notify.thr.title')} subtitle={t('notify.thr.subtitle')} />

      <div className="overflow-x-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
        <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--win-border)] bg-[var(--panel-surface-strong)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <th className="py-2.5 px-3 min-w-[170px]">{t('notify.thr.colEvent')}</th>
              <th className="py-2.5 px-2 text-center min-w-[84px] text-[var(--panel-warning-text)]">{levelLabels[0]}</th>
              <th className="py-2.5 px-2 text-center min-w-[84px] text-[var(--panel-danger-text)]">{levelLabels[1]}</th>
              <th className="py-2.5 px-2 text-center min-w-[84px] text-[var(--panel-danger-text)] font-bold">{levelLabels[2]}</th>
              <th className="py-2.5 px-2 text-center min-w-[76px]">{t('notify.thr.window')}</th>
              <th className="py-2.5 px-2 text-center min-w-[76px]">{t('notify.thr.cooldown')}</th>
              <th className="py-2.5 px-2 text-center min-w-[76px]">{t('notify.thr.quiet')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--win-border)]">
            {rows.map((row) => {
              const base = detectors.find((d) => d.event === row.event) as Detector
              const unit = base.countDistinct ? t('notify.thr.unitNames') : t('notify.thr.unitEvents')
              const eventTitle = t(`notify.event.${row.event}`)

              return (
                <tr key={row.event} className="transition-colors hover:bg-[var(--panel-surface-hover)]">
                  <td className="py-2.5 px-3 align-middle">
                    <p className="text-[12.5px] font-semibold text-[var(--win-text)]">{eventTitle}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">{t(`notify.thr.desc.${row.event}`)}</p>
                    {base.minDistinct > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                        <span>{t('notify.thr.minDistinct')}:</span>
                        <CompactNumberInput
                          value={row.minDistinct}
                          unit={t('notify.thr.unitNames')}
                          min={0}
                          onChange={(val) => patch(row.event, { minDistinct: val })}
                          ariaLabel={`${eventTitle} ${t('notify.thr.minDistinct')}`}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-2 text-center align-middle">
                    {row.levels[0] !== undefined ? (
                      <CompactNumberInput
                        value={row.levels[0]}
                        unit={unit}
                        min={1}
                        invalid={row.levels[0].trim() === ''}
                        onChange={(val) => patch(row.event, { levels: row.levels.map((v, j) => (j === 0 ? val : v)) })}
                        ariaLabel={`${eventTitle} ${levelLabels[0]}`}
                      />
                    ) : (
                      <span className="text-[var(--text-secondary)] select-none">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center align-middle">
                    {row.levels[1] !== undefined ? (
                      <CompactNumberInput
                        value={row.levels[1]}
                        unit={unit}
                        min={1}
                        invalid={row.levels[1].trim() === '' || Number(row.levels[1]) <= Number(row.levels[0])}
                        onChange={(val) => patch(row.event, { levels: row.levels.map((v, j) => (j === 1 ? val : v)) })}
                        ariaLabel={`${eventTitle} ${levelLabels[1]}`}
                      />
                    ) : (
                      <span className="text-[var(--text-secondary)] select-none">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center align-middle">
                    {row.levels[2] !== undefined ? (
                      <CompactNumberInput
                        value={row.levels[2]}
                        unit={unit}
                        min={1}
                        invalid={row.levels[2].trim() === '' || Number(row.levels[2]) <= Number(row.levels[1])}
                        onChange={(val) => patch(row.event, { levels: row.levels.map((v, j) => (j === 2 ? val : v)) })}
                        ariaLabel={`${eventTitle} ${levelLabels[2]}`}
                      />
                    ) : (
                      <span className="text-[var(--text-secondary)] select-none">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center align-middle">
                    <CompactNumberInput
                      value={row.window}
                      unit={t('notify.thr.unitMinutes')}
                      min={1}
                      invalid={row.window.trim() === '' || Number(row.window) < 1}
                      onChange={(val) => patch(row.event, { window: val })}
                      ariaLabel={`${eventTitle} ${t('notify.thr.window')}`}
                    />
                  </td>
                  <td className="py-2.5 px-2 text-center align-middle">
                    <CompactNumberInput
                      value={row.cooldown}
                      unit={t('notify.thr.unitMinutes')}
                      min={1}
                      invalid={row.cooldown.trim() === '' || Number(row.cooldown) < 1}
                      onChange={(val) => patch(row.event, { cooldown: val })}
                      ariaLabel={`${eventTitle} ${t('notify.thr.cooldown')}`}
                    />
                  </td>
                  <td className="py-2.5 px-2 text-center align-middle">
                    <CompactNumberInput
                      value={row.quiet}
                      unit={t('notify.thr.unitMinutes')}
                      min={1}
                      invalid={row.quiet.trim() === '' || Number(row.quiet) < 1}
                      onChange={(val) => patch(row.event, { quiet: val })}
                      ariaLabel={`${eventTitle} ${t('notify.thr.quiet')}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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


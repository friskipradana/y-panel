import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Radar, Settings2, X } from 'lucide-react'
import { pingHost, type PingResult } from '@/api/system'
import { subscribeLivePing } from '@/lib/liveSocket'
import { useLiveStore } from '@/store/liveStore'
import { FAIL_VALUE, asRange, useMetricSeries, useMetricsStore } from '@/store/metricsStore'
import { useWidgetStore } from '@/store/widgetStore'
import { useI18n } from '@/lib/i18n'
import { LineChart, RangeSwitch } from './LineChart'
import { summarize } from './chartStats'
import type { WidgetProps } from './types'

const INTERVALS = [5, 10, 30, 60]
const HOST_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*|[0-9A-Fa-f:.]+)$/

const ms = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`

function latencyColor(v: number) {
  if (v < 60) return 'var(--panel-success-text)'
  if (v < 180) return 'var(--panel-warning-text)'
  return 'var(--panel-danger-text)'
}

function toInt(value: unknown, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

export function PingWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const key = `ping:${widget.id}`
  const points = useMetricSeries(key)

  const host = String(widget.config?.host ?? '1.1.1.1')
  const port = toInt(widget.config?.port, 0)
  const intervalSec = Math.min(300, Math.max(5, toInt(widget.config?.intervalSec, 10)))
  const label = String(widget.config?.label ?? '')
  const range = asRange(widget.config?.range)

  const [last, setLast] = useState<PingResult | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ host, port: String(port || ''), intervalSec: String(intervalSec), label })
  const [draftError, setDraftError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const probe = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await pingHost(host, port)
      setLast(res)
      setRequestError(null)
      useMetricsStore.getState().push([[key, res.ok ? res.latencyMs : FAIL_VALUE]])
    } catch (err) {
      // The request itself failed (agent outdated, no permission, offline): this says
      // nothing about the target host, so it is shown as an error and not recorded as loss.
      const res = (err as { response?: { status?: number; data?: { error?: string } } }).response
      const message =
        res?.status === 404
          ? t('widget.ping.agentOutdated')
          : res?.status === 403
            ? t('widget.ping.forbidden')
            : res?.data?.error || t('widget.ping.requestFailed')
      setRequestError(message)
      setLast(null)
    } finally {
      inFlight.current = false
    }
    // t is stable per language; probing only depends on the target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, port, key])

  // While the live socket is connected the agent probes on its own schedule and pushes each result
  const liveConnected = useLiveStore((s) => s.connected)
  useEffect(() => {
    if (editing || !liveConnected) return
    setLast(null)
    setRequestError(null)
    return subscribeLivePing(widget.id, { host, port, intervalSec }, (res) => {
      setLast({ host, mode: res.mode === 'tcp' ? 'tcp' : 'icmp', ok: res.ok, latencyMs: res.latencyMs, resolved: res.resolved, error: res.error, checkedAt: res.at })
      useMetricsStore.getState().push([[key, res.ok ? res.latencyMs : FAIL_VALUE]], res.at)
    })
  }, [editing, liveConnected, widget.id, host, port, intervalSec, key])

  useEffect(() => {
    if (editing || liveConnected) return
    setLast(null)
    void probe()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void probe()
    }, intervalSec * 1000)
    return () => window.clearInterval(timer)
  }, [probe, intervalSec, editing, liveConnected])

  const stats = useMemo(() => summarize(points, range), [points, range])
  const total = stats.count + stats.failed
  const lossPct = total > 0 ? (stats.failed / total) * 100 : 0
  const online = last ? last.ok : null
  const latest = last?.ok ? last.latencyMs : null
  const gapMs = Math.max(20_000, intervalSec * 3_000)

  const startEdit = () => {
    setDraft({ host, port: String(port || ''), intervalSec: String(intervalSec), label })
    setDraftError(null)
    setEditing(true)
  }

  const save = () => {
    const nextHost = draft.host.trim()
    const nextPort = draft.port.trim() === '' ? 0 : Number(draft.port)
    if (!nextHost || nextHost.startsWith('-') || !HOST_RE.test(nextHost)) {
      setDraftError(t('widget.ping.invalidHost'))
      return
    }
    if (!Number.isInteger(nextPort) || nextPort < 0 || nextPort > 65535) {
      setDraftError(t('widget.ping.invalidPort'))
      return
    }
    const hostChanged = nextHost.toLowerCase() !== host.toLowerCase() || nextPort !== port
    if (hostChanged) useMetricsStore.getState().clear(key)
    updateConfig(widget.id, {
      host: nextHost,
      port: nextPort,
      intervalSec: Math.min(300, Math.max(5, toInt(draft.intervalSec, 10))),
      label: draft.label.trim(),
    })
    setEditing(false)
  }

  const fieldClass =
    'w-full rounded-md border bg-[var(--panel-field-bg)] px-2 py-1 font-mono text-[11px] text-[var(--win-text)] outline-none focus:border-[var(--focus-ring)]'

  if (editing) {
    return (
      <form
        className="flex flex-1 select-none flex-col justify-between gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="grid grid-cols-[1fr_64px] gap-2">
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
            {t('widget.ping.host')}
            <input
              autoFocus
              className={fieldClass}
              style={{ borderColor: 'var(--win-border)' }}
              value={draft.host}
              placeholder={'example.com / 8.8.8.8'}
              onChange={(e) => setDraft({ ...draft, host: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
            {t('widget.ping.port')}
            <input
              className={fieldClass}
              style={{ borderColor: 'var(--win-border)' }}
              value={draft.port}
              inputMode="numeric"
              placeholder={'ICMP'}
              onChange={(e) => setDraft({ ...draft, port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
            {t('widget.ping.label')}
            <input
              className={fieldClass}
              style={{ borderColor: 'var(--win-border)' }}
              value={draft.label}
              maxLength={24}
              placeholder={t('widget.ping.labelPlaceholder')}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
            {t('widget.ping.interval')}
            <select
              className={fieldClass}
              style={{ borderColor: 'var(--win-border)' }}
              value={draft.intervalSec}
              onChange={(e) => setDraft({ ...draft, intervalSec: e.target.value })}
            >
              {INTERVALS.map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
        </div>
        {draftError ? (
          <p role="alert" className="text-[10.5px] text-[var(--panel-danger-text)]">
            {draftError}
          </p>
        ) : (
          <p className="text-[10px] text-[var(--text-secondary)]">{t('widget.ping.modeHint')}</p>
        )}
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)]"
            style={{ borderColor: 'var(--win-border)' }}
          >
            <X size={11} />
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md bg-[var(--panel-primary-solid)] px-2 py-1 text-[10.5px] font-semibold text-white hover:brightness-110"
          >
            <Check size={11} />
            {t('common.save')}
          </button>
        </div>
      </form>
    )
  }

  const statusColor = online === null ? 'var(--status-offline)' : online ? 'var(--status-online)' : 'var(--status-error)'
  const target = port > 0 ? `${host}:${port}` : host

  return (
    <div className="flex flex-1 select-none flex-col justify-between gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} aria-hidden="true" />
            <span className="truncate font-mono text-[11.5px] font-semibold text-[var(--win-text)]" title={target}>
              {label || target}
            </span>
            <span className="shrink-0 rounded border px-1 font-mono text-[9px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--win-border)' }}>
              {port > 0 ? 'TCP' : 'ICMP'}
            </span>
          </div>
          {requestError ? (
            <div role="alert" className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[var(--panel-danger-text)]">
              {requestError}
            </div>
          ) : (
            <div className="mt-0.5 truncate font-mono text-[9.5px] text-[var(--text-secondary)]">
              {label ? target : null}
              {last?.resolved ? `${label ? ' · ' : ''}${last.resolved}` : null}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={startEdit}
          aria-label={t('widget.ping.edit')}
          title={t('widget.ping.edit')}
          className="shrink-0 rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]"
        >
          <Settings2 size={12} />
        </button>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        {latest !== null ? (
          <span className="font-mono text-xl font-bold tracking-tight @[260px]:text-2xl" style={{ color: latencyColor(latest) }}>
            {ms(latest)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-[var(--panel-danger-text)]">
            <Radar size={14} />
            {online === false ? t('widget.ping.timeout') : requestError ? t('widget.ping.error') : '…'}
          </span>
        )}
        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--text-secondary)]">
          <span>
            MIN <strong className="font-semibold text-[var(--win-text)]">{stats.count ? ms(stats.min) : '-'}</strong>
          </span>
          <span>
            AVG <strong className="font-semibold text-[var(--win-text)]">{stats.count ? ms(stats.avg) : '-'}</strong>
          </span>
          <span>
            MAX <strong className="font-semibold text-[var(--win-text)]">{stats.count ? ms(stats.max) : '-'}</strong>
          </span>
        </div>
      </div>

      <LineChart
        ariaLabel={t('widget.ping.aria', { host: target })}
        range={range}
        height={52}
        format={ms}
        gapMs={gapMs}
        series={[{ key, label: 'Ping', color: 'var(--panel-primary-text)', points }]}
      />

      <div className="flex items-center justify-between px-0.5">
        <span
          className="truncate font-mono text-[9.5px]"
          style={{ color: lossPct > 0 ? 'var(--panel-danger-text)' : 'var(--text-secondary)' }}
          title={last?.error || requestError || undefined}
        >
          {t('widget.ping.loss', { pct: lossPct.toFixed(lossPct > 0 && lossPct < 10 ? 1 : 0) })}
          {last && !last.ok && last.error ? ` · ${last.error}` : ''}
        </span>
        <RangeSwitch label={t('widget.graph.range')} value={range} onChange={(r) => updateConfig(widget.id, { range: r })} />
      </div>
    </div>
  )
}

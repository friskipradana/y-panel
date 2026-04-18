import { useContainers, useStartContainer, useStopContainer } from '@/hooks/useContainers'
import { useEffect } from 'react'
import { Boxes, Container as ContainerIcon, Play, RefreshCw, Square, Workflow } from 'lucide-react'
import type { Container } from '@/types'

const APP_ICONS: Record<string, string> = {
  grafana: '📊',
  portainer: '🐋',
  uptime: '💓',
  jellyfin: '🎬',
  nextcloud: '☁️',
  nginx: '🌐',
  postgres: '🐘',
  redis: '⚡',
  default: '📦',
}

function getIcon(name: string): string {
  const lower = name.toLowerCase()
  return Object.entries(APP_ICONS).find(([k]) => lower.includes(k))?.[1] ?? APP_ICONS.default
}

const STATE_STYLES: Record<Container['State'], { badge: string; btn: string; btnText: string; actionIcon: typeof Play }> = {
  running: { badge: 'panel-badge--success', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  exited: { badge: 'panel-badge--danger', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  paused: { badge: 'panel-badge--warning', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  restarting: { badge: 'panel-badge--info', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  dead: { badge: 'panel-badge--neutral', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
}

function StatusBadge({ state }: { state: Container['State'] }) {
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.dead
  return (
    <span className={`panel-badge ${stateStyle.badge}`}>
      <span className="panel-status-dot" />
      {state}
    </span>
  )
}

export function AppsWindow({ authenticated }: { authenticated?: boolean }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useContainers()

  useEffect(() => {
    if (authenticated) {
      void refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const startMutation = useStartContainer()
  const stopMutation = useStopContainer()
  const containers = Array.isArray(data) ? data : []

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Boxes className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">Runtime Apps</div>
            <div className="panel-window__meta">Kontrol container dari agent secara realtime</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button
            type="button"
            onClick={() => void refetch()}
            className="panel-icon-btn"
            aria-label="Refresh apps"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <Workflow className="h-3 w-3" />
              Container runtime
            </div>
            <div className="panel-hero__title">Agent memantau dan mengontrol service aplikasi host</div>
            <p className="panel-hero__description">
              Semua container ditarik dari runtime host melalui backend agent. Perubahan status akan otomatis tersinkron secara berkala tanpa perlu refresh manual.
            </p>
          </section>

          <div className="panel-toolbar">
            <p className="panel-window__meta">{containers.length} container · auto-refresh tiap 10 detik</p>
          </div>

          {isLoading ? (
            <div className="panel-loading">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Menghubungkan ke runtime agent...
            </div>
          ) : isError ? (
            <div className="panel-error-state">
              <ContainerIcon className="h-5 w-5" />
              <div>
                <p className="font-semibold">Tidak bisa memuat container dari agent</p>
                <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
                <p className="mt-1 text-[12px] leading-6 opacity-80">Pastikan ui-panel-agent aktif dan Docker dapat diakses oleh backend.</p>
              </div>
            </div>
          ) : containers.length === 0 ? (
            <div className="panel-empty">
              <Boxes className="h-8 w-8" />
              <span>Belum ada container aktif yang bisa ditampilkan.</span>
            </div>
          ) : (
            <div className="panel-window__stack">
              {containers.map((container) => {
                const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
                const stateStyle = STATE_STYLES[container.State] ?? STATE_STYLES.dead
                const ActionIcon = stateStyle.actionIcon
                const isMutating = startMutation.isPending || stopMutation.isPending

                return (
                  <div key={container.Id} className="panel-card panel-card--interactive p-4">
                    <div className="flex items-center gap-3">
                      <div className="panel-avatar text-lg">{getIcon(name)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-[var(--win-text)]">{name}</p>
                          <StatusBadge state={container.State} />
                        </div>
                        <p className="panel-meta-line mt-1 truncate">{container.Image}</p>
                      </div>
                      <button
                        type="button"
                        className={`panel-btn ${stateStyle.btn} min-w-[88px]`}
                        onClick={() => container.State === 'running' ? stopMutation.mutate(container.Id) : startMutation.mutate(container.Id)}
                        disabled={isMutating}
                      >
                        <ActionIcon className="h-3.5 w-3.5" />
                        {stateStyle.btnText}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

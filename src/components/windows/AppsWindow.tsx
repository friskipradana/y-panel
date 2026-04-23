import { useContainers, useStartContainer, useStopContainer } from '@/hooks/useContainers'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Boxes,
  Container as ContainerIcon,
  Play,
  RefreshCw,
  Search,
  Square,
  // Sparkles,
  Layers3,
  Server,
} from 'lucide-react'
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
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (authenticated) {
      void refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const startMutation = useStartContainer()
  const stopMutation = useStopContainer()
  const containers = Array.isArray(data) ? data : []
  const filteredContainers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return containers
    return containers.filter((container) => {
      const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
      return [name, container.Image, container.State, container.Status, container.Id]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [containers, search])

  const stats = useMemo(() => {
    const running = containers.filter((container) => container.State === 'running').length
    const stopped = containers.filter((container) => ['exited', 'dead'].includes(container.State)).length
    const attention = containers.filter((container) => ['paused', 'restarting'].includes(container.State)).length
    return { running, stopped, attention }
  }, [containers])

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
          <button type="button" onClick={() => void refetch()} className="panel-icon-btn" aria-label="Refresh apps">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <div className="panel-grid-compact panel-grid-compact--3">
            <div className="panel-card p-4">
              <div className="flex items-center gap-3">
                <div className="panel-avatar"><Layers3 className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Total container</div>
                  <div className="text-lg font-semibold text-[var(--win-text)]">{containers.length}</div>
                </div>
              </div>
            </div>
            <div className="panel-card p-4">
              <div className="flex items-center gap-3">
                <div className="panel-avatar"><Activity className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Sedang berjalan</div>
                  <div className="text-lg font-semibold text-[var(--win-text)]">{stats.running}</div>
                </div>
              </div>
            </div>
            <div className="panel-card p-4">
              <div className="flex items-center gap-3">
                <div className="panel-avatar"><Server className="h-4 w-4" /></div>
                <div>
                  <div className="panel-window__meta">Butuh perhatian</div>
                  <div className="text-lg font-semibold text-[var(--win-text)]">{stats.attention + stats.stopped}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-toolbar panel-toolbar--search">
            <form
              className="panel-search"
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(query.trim())
              }}
            >
              <Search className="h-4 w-4" />
              <input
                id="apps-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="panel-search__input"
                placeholder="Cari nama container, image, state, atau container id..."
              />
              <button type="submit" className="panel-btn panel-btn--primary-soft">Cari</button>
            </form>
            {/* <p className="panel-window__meta">{filteredContainers.length}/{containers.length} container • auto-refresh tiap 10 detik</p> */}
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
          ) : filteredContainers.length === 0 ? (
            <div className="panel-empty panel-empty--wide">
              <Boxes className="h-8 w-8" />
              <div className="space-y-1">
                <div className="text-sm font-medium text-[var(--win-text)]">Tidak ada container yang cocok</div>
                <div>Ubah kata kunci pencarian atau kosongkan filter untuk melihat semua runtime apps.</div>
              </div>
            </div>
          ) : (
            <div className="apps-grid">
              {filteredContainers.map((container) => {
                const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
                const stateStyle = STATE_STYLES[container.State] ?? STATE_STYLES.dead
                const ActionIcon = stateStyle.actionIcon
                const isMutating = startMutation.isPending || stopMutation.isPending

                return (
                  <div key={container.Id} className="panel-card panel-card--interactive apps-card">
                    <div className="apps-card__header">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="panel-avatar text-lg">{getIcon(name)}</div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[var(--win-text)]">{name}</p>
                          <p className="panel-meta-line mt-1 truncate">{container.Image}</p>
                        </div>
                      </div>
                      <StatusBadge state={container.State} />
                    </div>

                    <div className="apps-card__meta">
                      <div className="apps-card__meta-item">
                        <span className="apps-card__meta-label">Container ID</span>
                        <span className="panel-mono">{container.Id.slice(0, 12)}</span>
                      </div>
                      <div className="apps-card__meta-item">
                        <span className="apps-card__meta-label">Runtime status</span>
                        <span>{container.Status || container.State}</span>
                      </div>
                    </div>

                    <div className="apps-card__footer">
                      <button
                        type="button"
                        className={`panel-btn ${stateStyle.btn} min-w-[104px]`}
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

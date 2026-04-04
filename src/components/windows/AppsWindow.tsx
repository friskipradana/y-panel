import { useContainers, useStartContainer, useStopContainer } from '@/hooks/useContainers'
import type { Container } from '@/types'

const APP_ICONS: Record<string, string> = {
  grafana:    '📊',
  portainer:  '🐋',
  uptime:     '💓',
  jellyfin:   '🎬',
  nextcloud:  '☁️',
  nginx:      '🌐',
  postgres:   '🐘',
  redis:      '⚡',
  default:    '📦',
}

function getIcon(name: string): string {
  const lower = name.toLowerCase()
  return Object.entries(APP_ICONS).find(([k]) => lower.includes(k))?.[1] ?? APP_ICONS.default
}

function StatusBadge({ state }: { state: Container['State'] }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    running:    { bg: '#e8f5e9', text: '#2e7d32', dot: '#4caf50' },
    exited:     { bg: '#ffebee', text: '#c62828', dot: '#ef5350' },
    paused:     { bg: '#fff8e1', text: '#f57f17', dot: '#ffc107' },
    restarting: { bg: '#e3f2fd', text: '#1565c0', dot: '#42a5f5' },
    dead:       { bg: '#f5f5f5', text: '#757575', dot: '#9e9e9e' },
  }
  const c = colors[state] ?? colors.dead
  return (
    <span
      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {state}
    </span>
  )
}

export function AppsWindow() {
  const { data: containers, isLoading, isError, error } = useContainers()
  const startMutation = useStartContainer()
  const stopMutation = useStopContainer()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 gap-3 text-sm" style={{ color: 'var(--sand-400)' }}>
        <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Menghubungkan ke Portainer...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-sm rounded-lg p-4" style={{ background: '#ffebee', color: '#c62828' }}>
        <p className="font-medium mb-1">Tidak bisa terhubung ke Portainer</p>
        <p className="text-xs opacity-80">{(error as Error).message}</p>
        <p className="text-xs mt-2 opacity-60">Pastikan Portainer jalan di localhost:9000</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: 'var(--sand-400)' }}>
        {containers?.length ?? 0} container · auto-refresh tiap 10 detik
      </p>
      <div className="flex flex-col gap-2">
        {containers?.map((c) => (
          <div
            key={c.Id}
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.07)' }}
          >
            <span className="text-2xl">{getIcon(c.Names[0])}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--sand-600)' }}>
                {c.Names[0].replace(/^\//, '')}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--sand-400)' }}>
                {c.Image}
              </p>
            </div>
            <StatusBadge state={c.State} />
            {/* Start / Stop */}
            {c.State === 'running' ? (
              <button
                className="text-xs px-2 py-1 rounded-md transition-colors"
                style={{ background: '#ffebee', color: '#c62828' }}
                onClick={() => stopMutation.mutate(c.Id)}
                disabled={stopMutation.isPending}
              >
                Stop
              </button>
            ) : (
              <button
                className="text-xs px-2 py-1 rounded-md transition-colors"
                style={{ background: '#e8f5e9', color: '#2e7d32' }}
                onClick={() => startMutation.mutate(c.Id)}
                disabled={startMutation.isPending}
              >
                Start
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

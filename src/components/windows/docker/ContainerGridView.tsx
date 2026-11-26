import type { ReactNode } from 'react'
import { Boxes, Container as ContainerIcon, RefreshCw } from 'lucide-react'
import type { Container } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/ui/states'
import { StatusPill } from './DockerComponents'
import { isDatabaseControl, isWaha } from './constants'

export function DockerContainerIcon() {
  return (
    <div className="docker-app-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" />
        <path d="M4 8l8 4 8-4" />
        <path d="M12 12v8" />
      </svg>
    </div>
  )
}

export function formatContainerPorts(ports: Container['Ports']): string {
  if (!ports || ports.length === 0) return '-'
  const published = ports.filter((p) => p.PublicPort).map((p) => `:${p.PublicPort}`)
  if (published.length > 0) return Array.from(new Set(published)).join('\n')
  const priv = ports.map((p) => `:${p.PrivatePort}`)
  return Array.from(new Set(priv)).join('\n')
}

export function formatContainerIps(ips?: string[]): string {
  if (!ips || ips.length === 0) return '-'
  return ips.join('\n')
}

interface ContainerGridViewProps {
  t: (key: string, params?: Record<string, string | number>) => string
  isLoading: boolean
  isError: boolean
  error: unknown
  narrowed: boolean
  containers: Container[]
  onRetry: () => void
  renderActions: (container: Container) => ReactNode
}

export function ContainerStatePlaceholder({
  t,
  isLoading,
  isError,
  error,
  narrowed,
  onRetry,
}: {
  t: (key: string, params?: Record<string, string | number>) => string
  isLoading: boolean
  isError: boolean
  error: unknown
  narrowed: boolean
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 my-auto min-h-[240px]">
        <LoadingState>{t('docker.connectingAgent')}</LoadingState>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 my-auto min-h-[240px]">
        <div className="panel-error-state max-w-md w-full">
          <ContainerIcon className="h-5 w-5" strokeWidth={1.75} />
          <div>
            <p className="font-semibold">{t('docker.containersLoadFailed')}</p>
            <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
            <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.agentAccessHint')}</p>
          </div>
          <Button variant="primary" size="sm" icon={<RefreshCw size={12} />} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 my-auto min-h-[240px]">
      <div className="panel-empty panel-empty--wide">
        <Boxes className="h-8 w-8" strokeWidth={1.75} />
        <div className="space-y-1">
          <div className="text-sm font-medium text-[var(--win-text)]">
            {narrowed ? t('docker.noResults') : t('docker.noContainersMatch')}
          </div>
          {narrowed ? null : <div>{t('docker.emptyContainersHint')}</div>}
        </div>
      </div>
    </div>
  )
}

export function ContainerGridView({
  t,
  isLoading,
  isError,
  error,
  narrowed,
  containers,
  onRetry,
  renderActions,
}: ContainerGridViewProps) {
  return (
    <div className="app-catalog-cards-scroll">
      {isLoading || isError || containers.length === 0 ? (
        <ContainerStatePlaceholder
          t={t}
          isLoading={isLoading}
          isError={isError}
          error={error}
          narrowed={narrowed}
          onRetry={onRetry}
        />
      ) : (
        <div className="app-catalog-card-grid">
          {containers.map((container) => {
            const name = container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12)
            const stack = container.ProjectName || container.Labels?.['com.docker.compose.project'] || ''
            const isDatabase = container.Labels?.['reneo.kind'] === 'database'
            const isControl = isDatabaseControl(container)
            const isWhatsApp = isWaha(container)
            const isAppCatalog =
              container.Labels?.['reneo.kind'] === 'app-catalog' ||
              name.startsWith('reneo-app-') ||
              stack.startsWith('reneo-app-')
            const portsText = formatContainerPorts(container.Ports)
            const hasStatic = (container.StaticIps?.length ?? 0) > 0
            const ipText = formatContainerIps(hasStatic ? container.StaticIps : container.IpAddresses)

            return (
              <article key={container.Id} className="app-catalog-card">
                <div className="space-y-2.5 min-w-0">
                  <div className="app-catalog-card__head">
                    <div className="app-catalog-card__identity">
                      <DockerContainerIcon />
                      <div className="app-catalog-card__titles">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="docker-app-name truncate" title={name}>{name}</span>
                          {isDatabase ? (
                            <Badge tone="info" size="sm" title={t('docker.databaseHint')}>{t('docker.databaseBadge')}</Badge>
                          ) : isControl ? (
                            <Badge tone="info" size="sm" title={t('docker.databaseControlHint')}>{t('docker.databaseControlBadge')}</Badge>
                          ) : isWhatsApp ? (
                            <Badge tone="info" size="sm" title={t('docker.wahaHint')}>{t('docker.wahaBadge')}</Badge>
                          ) : isAppCatalog ? (
                            <Badge tone="info" size="sm" title={t('docker.appCatalogHint')}>{t('docker.appCatalogBadge')}</Badge>
                          ) : null}
                        </div>
                        <span className="docker-row__sub panel-mono truncate" title={container.Image}>
                          {container.Image}{stack ? ` · ${stack}` : ''}
                        </span>
                      </div>
                    </div>
                    <StatusPill state={container.State} />
                  </div>

                  <div className="space-y-1 text-xs">
                    {portsText !== '-' ? (
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span className="opacity-70 shrink-0">{t('docker.colPort')}:</span>
                        <span className="panel-mono text-[var(--win-text)] truncate" title={portsText}>{portsText.replace(/\n/g, ' ')}</span>
                      </div>
                    ) : null}
                    {ipText !== '-' ? (
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span className="opacity-70 shrink-0">{t('docker.colIpAddress')}:</span>
                        <span className="panel-mono text-[var(--win-text)] truncate" title={ipText}>{ipText.replace(/\n/g, ', ')}</span>
                        <Badge tone={hasStatic ? 'success' : 'neutral'} size="sm">
                          {hasStatic ? t('docker.ipStaticBadge') : t('docker.ipDynamicBadge')}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="app-catalog-card__footer">{renderActions(container)}</div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

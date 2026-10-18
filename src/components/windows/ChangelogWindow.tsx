import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ExternalLink, GitBranch, RefreshCcw, TriangleAlert } from 'lucide-react'
import { getSystemChangelog } from '@/api/agent'
import type { ChangelogEntry } from '@/types'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { Markdown } from '@/lib/markdown'
import { usePanelVersion } from '@/lib/version'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

function Release({ item, installed, open, onToggle }: { item: ChangelogEntry; installed: boolean; open: boolean; onToggle: () => void }) {
  const { t } = useI18n()
  const hasBody = !!item.body?.trim()
  return (
    <article className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasBody}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] disabled:cursor-default"
      >
        <span className="mt-0.5 text-[var(--text-secondary)]">
          {hasBody ? open ? <ChevronDown size={16} /> : <ChevronRight size={16} /> : <span className="inline-block w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="panel-mono text-[0.9375rem] font-semibold">v{item.version}</span>
            {installed ? <Badge tone="success" dot>{t('changelog.installed')}</Badge> : null}
            {item.prerelease ? <Badge tone="warning">{t('changelog.prerelease')}</Badge> : null}
            <span className="text-[0.75rem] text-[var(--text-secondary)]">{formatDateID(item.releasedAt)}</span>
          </span>
          {item.title && item.title !== `v${item.version}` ? (
            <span className="mt-1 block text-[0.8125rem] font-medium">{item.title}</span>
          ) : null}
          {!open && item.summary ? (
            <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{item.summary}</span>
          ) : null}
        </span>
      </button>
      {open && hasBody ? (
        <div className="border-t border-[var(--win-border)] px-4 py-3">
          <Markdown source={item.body ?? ''} />
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--panel-primary-text)] hover:underline"
            >
              <ExternalLink size={13} />
              {t('changelog.openOnGithub')}
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

// Release notes follow the GitHub releases of the project; offline servers fall back to stored entries.
export function ChangelogWindow() {
  const { t } = useI18n()
  const { version } = usePanelVersion()
  const [openVersion, setOpenVersion] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['system-changelog'],
    queryFn: () => getSystemChangelog(),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const items = query.data?.items ?? []
  const fromGithub = query.data?.source === 'github'
  const expanded = openVersion ?? items[0]?.version ?? null

  return (
    <div className="panel-window flex h-full flex-col">
      <div className="flex min-h-[40px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--win-text)]">{t('changelog.title')}</span>
          <span>•</span>
          <span className="panel-mono font-medium text-[var(--panel-primary-text)]">v{version}</span>
          {query.data ? (
            <Badge tone={fromGithub ? 'info' : 'neutral'}>
              <GitBranch size={11} />
              {fromGithub ? t('changelog.sourceGithub') : t('changelog.sourceLocal')}
            </Badge>
          ) : null}
        </div>
        <IconButton id="changelog-refresh" type="button" onClick={() => void query.refetch()} label={t('changelog.refresh')} disabled={query.isFetching}>
          <RefreshCcw className={`h-3.5 w-3.5 ${(query.isFetching && !query.isLoading) ? 'animate-spin' : ''}`} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {query.data?.warning ? (
            <p className="rounded-lg border border-[var(--panel-warning-border)] bg-[var(--panel-warning-bg)] px-3 py-2 text-[0.75rem] text-[var(--panel-warning-text)]">
              {t('changelog.staleWarning')}
            </p>
          ) : null}

          {query.isLoading ? (
            <LoadingState>{t('changelog.loading')}</LoadingState>
          ) : query.isError || !query.data ? (
            <ErrorState
              title={t('changelog.loadFailed')}
              hint={t('changelog.loadFailedHint')}
              action={
                <Button variant="primary" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState icon={<TriangleAlert />}>{t('changelog.empty')}</EmptyState>
          ) : (
            items.map((item) => (
              <Release
                key={`${item.version}-${item.id}`}
                item={item}
                installed={item.version === version}
                open={expanded === item.version}
                onToggle={() => setOpenVersion(expanded === item.version ? '' : item.version)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

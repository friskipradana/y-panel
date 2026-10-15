import { Select } from '@/components/ui/Select'
import { Plus, RefreshCw } from 'lucide-react'
import { type AttentionFilter } from './projectsConfig'
import type { ProjectsWindowState } from './useProjectsWindow'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'

export function ProjectsToolbar({ pw }: { pw: ProjectsWindowState }) {
  const {
    t,
    setShowCreate,
    setEditingProject,
    setForm,
    attentionOnly,
    setAttentionOnly,
    attentionFilter,
    setAttentionFilter,
    refetch,
    refetchAttentionSummary,
    summaryTotal,
    activeCount,
    degradedCount,
    driftCount,
    attentionCount,
    showRefreshing,
  } = pw

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--win-text)]">{summaryTotal} {t('projects.title')}</span>
        <span>•</span>
        <span className="text-[var(--panel-success-text)] font-medium">{t('projects.activeCount', { count: activeCount })}</span>
        {attentionCount > 0 && (
          <>
            <span>•</span>
            <span className="text-amber-400 font-medium">{t('projects.attentionCount', { count: attentionCount })}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select
          id="projects-attention-filter"
          value={attentionOnly ? attentionFilter : 'off'}
          onChange={(value) => {
            if (value === 'off') {
              setAttentionOnly(false)
              setAttentionFilter('all')
              return
            }
            setAttentionOnly(true)
            setAttentionFilter(value as AttentionFilter)
          }}
          options={[
            { value: 'off', label: t('projects.filterAll'), description: t('projects.filterAllDescription', { total: summaryTotal }) },
            { value: 'all', label: t('projects.filterAttention', { count: attentionCount }), description: t('projects.filterAttentionDescription', { count: attentionCount }) },
            { value: 'drift', label: t('projects.filterDrift', { count: driftCount }), description: t('projects.filterDriftDescription') },
            { value: 'degraded', label: t('projects.filterDegraded', { count: degradedCount }), description: t('projects.filterDegradedDescription') },
          ]}
          className="min-w-[170px]"
          buttonClassName="h-[30px] py-0 text-xs"
          dropdownClassName="left-auto right-0 min-w-[340px] max-w-[min(520px,calc(100vw-32px))]"
          itemClassName="projects-attention-filter__item"
        />
        <IconButton type="button" onClick={() => { void refetch(); void refetchAttentionSummary() }} label={t('projects.refresh')} disabled={showRefreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${showRefreshing ? 'animate-spin' : ''}`} />
        </IconButton>
        <Button onClick={() => { setEditingProject(null); setForm({ name: '', description: '', projectType: 'nodejs', repoUrl: '', workingDir: '', spaFallback: true }); setShowCreate(true) }} variant="primary-soft" className="text-xs py-1 px-2.5">
          <Plus className="h-3.5 w-3.5" />
          {t('projects.createButton')}
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, RefreshCw } from 'lucide-react'
import { getProjectLogs } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { ProjectsWindowState } from './useProjectsWindow'

// What a project wrote, and what the agent did to it; follows the end while it is open
export function ProjectLogModal({ pw }: { pw: ProjectsWindowState }) {
  const { t, logProject, setLogProject, pollingActive } = pw
  const endRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['project-logs', logProject?.id],
    queryFn: () => getProjectLogs(logProject!.id),
    enabled: !!logProject,
    refetchInterval: logProject && pollingActive ? 3_000 : false,
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [data])

  return (
    <Modal
      open={!!logProject}
      onClose={() => setLogProject(null)}
      title={t('projects.logsTitle')}
      subtitle={logProject?.name}
      icon={<FileText />}
      size="sheet"
      width={1040}
      footer={
        <>
          <Button variant="ghost" icon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />} onClick={() => void refetch()}>
            {t('projects.refresh')}
          </Button>
          <Button variant="primary" onClick={() => setLogProject(null)}>{t('common.close')}</Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingState>{t('projects.logsLoading')}</LoadingState>
      ) : isError ? (
        <ErrorState title={t('projects.logsFailed')} hint={t('projects.logsFailedHint')} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<FileText />}>{t('projects.logsEmpty')}</EmptyState>
      ) : (
        <div className="max-h-full overflow-auto rounded-[10px] border border-[var(--win-border)] bg-[var(--terminal-bg)] p-3 text-[var(--terminal-fg)]">
          <pre className="panel-mono m-0 whitespace-pre-wrap break-all text-[12px] leading-5">{data.join('\n')}</pre>
          <div ref={endRef} />
        </div>
      )}
    </Modal>
  )
}

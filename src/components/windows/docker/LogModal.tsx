import { RefreshCw } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import type { DockerWindowState } from './useDockerWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/Checkbox'

export function LogModal({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    logModal,
    setLogModal,
    logTail,
    setLogTail,
    logAutoScroll,
    setLogAutoScroll,
    logViewerRef,
    logsQuery,
  } = docker
  if (!logModal) return null

  return (
    <Modal
      open
      onClose={() => setLogModal(null)}
      title={t('docker.realtimeLogs')}
      subtitle={t('docker.refreshEverySeconds', { name: logModal.name })}
      size="sheet"
      width={1040}
    >
      <div className="docker-log-toolbar">
        <div className="docker-log-toolbar__left">
          <Badge>tail {logTail}</Badge>
          {logsQuery.isFetching && <Badge tone="info">{t('docker.syncing')}</Badge>}
        </div>
        <div className="docker-log-toolbar__right">
          <Checkbox checked={logAutoScroll} onChange={setLogAutoScroll} label={t('docker.autoScroll')} />
          <Select
            id="docker-log-tail-select"
            value={String(logTail)}
            onChange={(value: string) => setLogTail(Number(value))}
            options={[
              { value: '100', label: t('docker.lines', { count: 100 }) },
              { value: '200', label: t('docker.lines', { count: 200 }) },
              { value: '500', label: t('docker.lines', { count: 500 }) },
              { value: '1000', label: t('docker.lines', { count: 1000 }) },
            ]}
            className="min-w-[140px]"
            buttonClassName="h-[34px] rounded-[10px] py-0 text-[12px]"
            dropdownClassName="left-auto right-0 min-w-[160px]"
          />
          <Button type="button" variant="ghost" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>
      {logsQuery.isError ? (
        <div className="panel-empty panel-empty--danger">{t('docker.logLoadFailed')}</div>
      ) : (
        <pre ref={logViewerRef} className="docker-log-viewer">
          {(logsQuery.data?.lines ?? []).length > 0
            ? logsQuery.data?.lines.join('\n')
            : logsQuery.isLoading
              ? t('docker.loadingLogs')
              : t('docker.noLogs')}
        </pre>
      )}
    </Modal>
  )
}

import { ExternalLink, Settings2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ManageDatabaseContent } from './ManageDatabaseContent'
import type { DatabasesWindowState } from './useDatabasesWindow'

// One place to look inside and administer a database. The same view opens full page at /database/{id}.
export function ManageDatabaseModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, manageTarget, setManageTarget } = dbw
  const target = manageTarget

  return (
    <Modal
      open={!!target}
      onClose={() => setManageTarget(null)}
      title={t('databases.admin.title')}
      subtitle={target ? `${target.engineLabel} · ${target.name}` : undefined}
      icon={<Settings2 />}
      size="sheet"
      width={1040}
      footer={
        target ? (
          <IconButtonLink id={target.id} label={t('databases.admin.openTab')} />
        ) : undefined
      }
    >
      {target ? <ManageDatabaseContent key={target.id} target={target} /> : null}
    </Modal>
  )
}

function IconButtonLink({ id, label }: { id: number; label: string }) {
  return (
    <a
      href={`/database/${id}`}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--panel-primary-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <ExternalLink size={13} />
      {label}
    </a>
  )
}


import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { PasswordPanel } from './PasswordPanel'
import { SqlPanel } from './SqlPanel'
import { TablesPanel } from './TablesPanel'
import { UsersPanel } from './UsersPanel'
import type { DatabasesWindowState } from './useDatabasesWindow'

type Tab = 'tables' | 'sql' | 'users' | 'password'

// One place to look inside and administer a database: tables, console, accounts, password.
export function ManageDatabaseModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, manageTarget, setManageTarget } = dbw
  const [tab, setTab] = useState<Tab>('tables')
  const target = manageTarget

  useEffect(() => {
    if (target) setTab('tables')
  }, [target?.id])

  const sqlFamily = target ? ['postgres', 'mysql', 'mariadb'].includes(target.engine) : false

  return (
    <Modal
      open={!!target}
      onClose={() => setManageTarget(null)}
      title={t('databases.admin.title')}
      subtitle={target ? `${target.engineLabel} · ${target.name}` : undefined}
      icon={<Settings2 />}
      size="sheet"
      width={1040}
    >
      {target ? (
        <div className="space-y-4">
          <Tabs
            label={t('databases.admin.title')}
            value={tab}
            onChange={setTab}
            items={[
              { key: 'tables', label: sqlFamily ? t('databases.admin.tabTables') : t('databases.admin.tabKeys') },
              { key: 'sql', label: target.engine === 'redis' ? t('databases.admin.tabCommands') : t('databases.admin.tabSql') },
              { key: 'users', label: t('databases.admin.tabUsers') },
              { key: 'password', label: t('databases.admin.tabPassword') },
            ]}
          />
          {tab === 'tables' ? <TablesPanel databaseId={target.id} /> : null}
          {tab === 'sql' ? <SqlPanel databaseId={target.id} engine={target.engine} /> : null}
          {tab === 'users' ? <UsersPanel databaseId={target.id} supported={sqlFamily} /> : null}
          {tab === 'password' ? <PasswordPanel databaseId={target.id} engine={target.engine} /> : null}
        </div>
      ) : null}
    </Modal>
  )
}

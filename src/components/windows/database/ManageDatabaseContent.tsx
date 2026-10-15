import { useState } from 'react'
import type { UserDatabase } from '@/api/agent'
import { Tabs } from '@/components/ui/Tabs'
import { useI18n } from '@/lib/i18n'
import { PasswordPanel } from './PasswordPanel'
import { SqlPanel } from './SqlPanel'
import { TablesPanel } from './TablesPanel'
import { UsersPanel } from './UsersPanel'

type Tab = 'tables' | 'sql' | 'users' | 'password'

// Tables, console, accounts and password of one database (dialog and full page both use it).
export function ManageDatabaseContent({ target }: { target: UserDatabase }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('tables')
  const sqlFamily = ['postgres', 'mysql', 'mariadb'].includes(target.engine)

  return (
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
  )
}

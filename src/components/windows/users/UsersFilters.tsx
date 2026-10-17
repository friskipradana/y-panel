import type { HostingPlan } from '@/api/hosting'
import type { UserListParams, UsersSummary } from '@/api/users'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { useI18n } from '@/lib/i18n'

export type PlanStateFilter = '' | NonNullable<UserListParams['planState']>

export interface UsersFilterState {
  planState: PlanStateFilter
  status: '' | 'active' | 'suspended'
  plan: string
}

export const NO_FILTERS: UsersFilterState = { planState: '', status: '', plan: '' }

interface UsersFiltersProps {
  value: UsersFilterState
  onChange: (next: UsersFilterState) => void
  /** Superadmin with hosting mode on: plan tabs and the plan filter show */
  hosting: boolean
  summary?: UsersSummary
  plans: HostingPlan[]
}

// Which accounts the list shows: by plan state (tabs with counts), by status, by plan
export function UsersFilters({ value, onChange, hosting, summary, plans }: UsersFiltersProps) {
  const { t } = useI18n()
  const set = (patch: Partial<UsersFilterState>) => onChange({ ...value, ...patch })

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--win-border)] px-3 py-2.5">
      {hosting ? (
        <div className="overflow-x-auto">
          <Tabs
            label={t('hosting.users.stateTabs')}
            value={value.planState || 'all'}
            onChange={(key) => set({ planState: key === 'all' ? '' : (key as PlanStateFilter) })}
            items={[
              { key: 'all', label: t('hosting.users.all'), count: summary?.total },
              { key: 'active', label: t('hosting.users.onPlan'), count: summary?.planActive },
              { key: 'expiring', label: t('hosting.users.expiring'), count: summary?.expiring },
              { key: 'grace', label: t('hosting.users.grace'), count: summary?.grace },
              { key: 'expired', label: t('hosting.users.expired'), count: summary?.expired },
              { key: 'none', label: t('hosting.users.noPlan'), count: summary?.noPlan },
            ]}
          />
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={value.status}
          onChange={(status) => set({ status: status as UsersFilterState['status'] })}
          options={[
            { value: '', label: t('hosting.users.anyStatus') },
            { value: 'active', label: t('hosting.users.statusActive') },
            { value: 'suspended', label: t('hosting.users.statusSuspended') },
          ]}
        />
        {hosting ? (
          <Select
            value={value.plan}
            onChange={(plan) => set({ plan })}
            searchable={plans.length > 8}
            options={[
              { value: '', label: t('hosting.users.anyPlan') },
              { value: 'none', label: t('hosting.userPlan.none') },
              ...plans.map((plan) => ({ value: String(plan.id), label: plan.name, description: plan.slug })),
            ]}
          />
        ) : null}
      </div>
    </div>
  )
}

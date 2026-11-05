import { useEffect, useState } from 'react'
import { CircleArrowUp, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { DatabasesWindowState } from './useDatabasesWindow'

export function UpgradeDatabaseModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, engines, upgradeTarget, setUpgradeTarget, upgradeMut } = dbw
  const target = upgradeTarget
  const engine = engines.find((item) => item.id === target?.engine)

  const [version, setVersion] = useState('')

  useEffect(() => {
    if (target) {
      setVersion(target.version || engine?.defaultVersion || '')
    }
  }, [target, engine])

  const close = () => {
    if (upgradeMut.isPending) return
    setUpgradeTarget(null)
  }

  const versionsList = engine?.versions ?? []
  const availableVersions = target?.version && !versionsList.includes(target.version)
    ? [target.version, ...versionsList]
    : versionsList

  const options = availableVersions.map((v) => ({
    value: v,
    label: v,
    description:
      v === target?.version
        ? t('databases.upgradeCurrentVersion')
        : v === engine?.defaultVersion
          ? t('databases.versionDefault')
          : undefined,
  }))

  const isSameVersion = version === target?.version

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={t('databases.upgradeModalTitle')}
      subtitle={target ? `${target.engineLabel} · ${target.name}` : undefined}
      icon={<CircleArrowUp />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={upgradeMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={upgradeMut.isPending}
            disabled={!target || !version || upgradeMut.isPending}
            onClick={() => {
              if (target && version) {
                upgradeMut.mutate({ id: target.id, version })
              }
            }}
          >
            {isSameVersion ? t('databases.upgradeRecreateAction') : t('databases.upgradeAction')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="flex items-center justify-between rounded border border-[var(--panel-border)] bg-[var(--card-bg)] px-3 py-2 text-xs">
          <span className="text-[var(--text-secondary)]">{t('databases.upgradeCurrentLabel')}</span>
          <span className="panel-mono font-medium text-[var(--win-text)]">{target?.version || engine?.defaultVersion || '-'}</span>
        </div>

        <Field label={t('databases.upgradeTargetVersion')} hint={t('databases.upgradeVersionHint')}>
          <Select
            value={version}
            onChange={setVersion}
            options={options.length > 0 ? options : [{ value: version, label: version || '-' }]}
          />
        </Field>

        <div className="rounded border border-[var(--panel-border)] bg-[var(--card-bg)] p-3 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5 font-medium text-[var(--win-text)]">
            <ShieldCheck className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
            <span>{t('databases.upgradeDataSafeTitle')}</span>
          </div>
          <p className="mt-1">{t('databases.upgradePreserveNote')}</p>
        </div>
      </div>
    </Modal>
  )
}

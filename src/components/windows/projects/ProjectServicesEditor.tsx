import { Plus, Trash2 } from 'lucide-react'
import type { ProjectService } from '@/api/projects'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { CommandFields } from './ProjectRunFields'
import { EMPTY_SERVICE, MAX_SERVICES } from './projectRun'

// The processes of a project of several: a frontend and a backend, a site and a worker. One address serves them all; a request goes to the
// process with the longest path that starts it.
export function ProjectServicesEditor({ services, onChange }: { services: ProjectService[]; onChange: (next: ProjectService[]) => void }) {
  const { t } = useI18n()
  const patch = (index: number, next: Partial<ProjectService>) => onChange(services.map((service, i) => (i === index ? { ...service, ...next } : service)))

  return (
    <section className="space-y-3" aria-label={t('projects.services.title')}>
      <div>
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('projects.services.title')}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t('projects.services.hint')}</p>
      </div>

      {services.map((service, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="panel-mono text-[12px] font-semibold text-[var(--win-text)]">{service.name || t('projects.services.unnamed', { n: index + 1 })}</span>
            <IconButton label={t('projects.services.remove', { name: service.name || String(index + 1) })} tone="danger" onClick={() => onChange(services.filter((_, i) => i !== index))}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('projects.services.name')} htmlFor={`svc-${index}-name`}>
              <TextInput id={`svc-${index}-name`} mono value={service.name} maxLength={30} onChange={(e) => patch(index, { name: e.target.value.toLowerCase() })} placeholder="api" />
            </Field>
            <Field label={t('projects.services.kind')} htmlFor={`svc-${index}-kind`}>
              <Select
                id={`svc-${index}-kind`}
                value={service.kind}
                onChange={(kind) => patch(index, { kind: kind as ProjectService['kind'] })}
                options={[
                  { value: 'process', label: t('projects.services.kind.process') },
                  { value: 'static', label: t('projects.services.kind.static') },
                ]}
              />
            </Field>
            <Field label={t('projects.services.path')} htmlFor={`svc-${index}-path`}>
              <TextInput id={`svc-${index}-path`} mono value={service.path} onChange={(e) => patch(index, { path: e.target.value })} placeholder="/api" />
            </Field>
          </div>
          <p className="-mt-1.5 text-[11.5px] text-[var(--text-secondary)]">{t('projects.services.pathHint')}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('projects.services.dir')} htmlFor={`svc-${index}-dir`} hint={t('projects.services.dirHint')}>
              <TextInput id={`svc-${index}-dir`} mono value={service.dir} onChange={(e) => patch(index, { dir: e.target.value })} placeholder="api" />
            </Field>
            {service.kind === 'static' ? (
              <Field label={t('projects.services.serve')} htmlFor={`svc-${index}-serve`} hint={t('projects.services.serveHint')}>
                <TextInput id={`svc-${index}-serve`} mono value={service.serve} onChange={(e) => patch(index, { serve: e.target.value })} placeholder="dist" />
              </Field>
            ) : (
              <Field label={t('projects.services.port')} htmlFor={`svc-${index}-port`} hint={t('projects.services.portHint')}>
                <TextInput
                  id={`svc-${index}-port`}
                  mono
                  type="number"
                  min={0}
                  max={65535}
                  value={service.port || ''}
                  onChange={(e) => patch(index, { port: Number(e.target.value) || 0 })}
                  placeholder="0"
                />
              </Field>
            )}
          </div>

          <CommandFields value={service} onChange={(next) => patch(index, next)} idPrefix={`svc-${index}`} showStart={service.kind === 'process'} />
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled={services.length >= MAX_SERVICES} onClick={() => onChange([...services, { ...EMPTY_SERVICE, path: services.length === 0 ? '/' : '/api' }])}>
        {t('projects.services.add')}
      </Button>
      {services.length >= MAX_SERVICES ? <p className="text-[11.5px] text-[var(--text-secondary)]">{t('projects.services.limit', { max: MAX_SERVICES })}</p> : null}
    </section>
  )
}

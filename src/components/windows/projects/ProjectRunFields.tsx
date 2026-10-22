import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { RUNTIME_PRESETS, presetOf, type RunForm, type RuntimePreset } from './projectRun'

interface CommandSet {
  installCommand: string
  buildCommand: string
  startCommand: string
}

// The runtime box and the three commands: a runtime fills them, and each can be written by hand. Used for a project of one process and
// for each process of a project of several.
export function CommandFields<T extends CommandSet>({ value, onChange, idPrefix, showStart = true }: { value: T; onChange: (next: T) => void; idPrefix: string; showStart?: boolean }) {
  const { t } = useI18n()
  const current = presetOf(value)
  return (
    <div className="space-y-3">
      <Field label={t('projects.run.preset')} htmlFor={`${idPrefix}-preset`} hint={t('projects.run.presetHint')}>
        <Select
          id={`${idPrefix}-preset`}
          value={current}
          onChange={(key) => {
            if (key in RUNTIME_PRESETS) onChange({ ...value, ...RUNTIME_PRESETS[key as RuntimePreset] })
          }}
          placeholder={t('projects.run.presetOwn')}
          options={(Object.keys(RUNTIME_PRESETS) as RuntimePreset[]).map((key) => ({ value: key, label: t(`projects.run.preset.${key}`) }))}
        />
      </Field>
      <Field label={t('projects.run.install')} htmlFor={`${idPrefix}-install`} hint={t('projects.run.installHint')}>
        <TextInput id={`${idPrefix}-install`} mono value={value.installCommand} onChange={(e) => onChange({ ...value, installCommand: e.target.value })} placeholder="bun install" spellCheck={false} />
      </Field>
      <Field label={t('projects.run.build')} htmlFor={`${idPrefix}-build`} hint={t('projects.run.buildHint')}>
        <TextInput id={`${idPrefix}-build`} mono value={value.buildCommand} onChange={(e) => onChange({ ...value, buildCommand: e.target.value })} placeholder="bun run build" spellCheck={false} />
      </Field>
      {showStart ? (
        <Field label={t('projects.run.start')} htmlFor={`${idPrefix}-start`} hint={t('projects.run.startHint')}>
          <TextInput id={`${idPrefix}-start`} mono value={value.startCommand} onChange={(e) => onChange({ ...value, startCommand: e.target.value })} placeholder="bun run start" spellCheck={false} />
        </Field>
      ) : null}
    </div>
  )
}

// How a project runs besides its type: the commands of a project of one process, and the variables of any project
export function ProjectRunFields({ projectType, run, onChange }: { projectType: string; run: RunForm; onChange: (next: RunForm) => void }) {
  const { t } = useI18n()
  const single = projectType !== 'static' && projectType !== 'stack'
  return (
    <div className="space-y-3">
      {single ? <CommandFields value={run} onChange={(next) => onChange({ ...run, ...next })} idPrefix="project-run" /> : null}
      {projectType !== 'static' ? (
        <Field label={t('projects.run.env')} htmlFor="project-env" hint={t('projects.run.envHint')}>
          <Textarea
            id="project-env"
            rows={4}
            value={run.envText}
            onChange={(e) => onChange({ ...run, envText: e.target.value })}
            placeholder={'NODE_ENV=production\nDATABASE_URL=postgres://...'}
            spellCheck={false}
            className="panel-mono"
          />
        </Field>
      ) : null}
    </div>
  )
}

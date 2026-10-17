import { FolderCode } from 'lucide-react'
import { TYPE_ICON, PROJECT_TYPES } from './projectsConfig'
import type { ProjectsWindowState } from './useProjectsWindow'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/Checkbox'

// One dialog for a new project and for editing one: pick what it runs as, then only the fields that type uses
export function ProjectFormModal({ pw }: { pw: ProjectsWindowState }) {
  const { t, showCreate, setShowCreate, editingProject, setEditingProject, form, setForm, createMut, updateMut } = pw
  if (!(showCreate || editingProject)) return null

  const close = () => {
    setShowCreate(false)
    setEditingProject(null)
  }
  const busy = createMut.isPending || updateMut.isPending
  const name = form.name.trim()
  // a project made by an older version may have a type that new ones cannot pick; it stays selectable while editing it
  const types = PROJECT_TYPES.includes(form.projectType) ? PROJECT_TYPES : [...PROJECT_TYPES, form.projectType]

  const submit = () => {
    if (!name || busy) return
    const payload = { ...form, name, repoUrl: form.repoUrl.trim(), workingDir: form.workingDir.trim(), description: form.description.trim() }
    if (editingProject) updateMut.mutate({ id: editingProject.id, payload })
    else createMut.mutate(payload)
  }

  return (
    <Modal
      open
      onClose={close}
      title={editingProject ? t('projects.editProject') : t('projects.newProject')}
      icon={<FolderCode />}
      width={520}
      footer={
        <>
          <Button type="button" onClick={close} variant="ghost">{t('common.cancel')}</Button>
          <Button type="button" onClick={submit} loading={busy} disabled={!name} variant="primary">
            {editingProject ? t('projects.saveProject') : t('projects.createButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('projects.nameLabel')} htmlFor="project-name" hint={t('projects.nameHelp')}>
          <TextInput
            id="project-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('projects.appNamePlaceholder')}
            autoFocus
          />
        </Field>

        <Field label={t('projects.runtimeType')} hint={PROJECT_TYPES.includes(form.projectType) ? t(`projects.typeHint.${form.projectType}`) : undefined}>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label={t('projects.runtimeType')}>
            {types.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={form.projectType === type}
                onClick={() => setForm((f) => ({ ...f, projectType: type }))}
                className={['panel-btn justify-center gap-1.5 px-2 text-[12px] font-medium shadow-none', form.projectType === type ? 'panel-btn--primary-soft' : 'panel-btn--ghost'].join(' ')}
              >
                {TYPE_ICON[type]}
                <span>{PROJECT_TYPES.includes(type) ? t(`projects.type.${type}`) : type}</span>
              </button>
            ))}
          </div>
        </Field>

        {form.projectType === 'static' ? (
          <Checkbox
            checked={form.spaFallback}
            onChange={(checked) => setForm((f) => ({ ...f, spaFallback: checked }))}
            label={t('projects.spaFallback')}
            description={t('projects.spaFallbackHint')}
          />
        ) : null}

        {form.projectType === 'custom' ? (
          <Field label={t('projects.startScript')} htmlFor="project-start-script" hint={t('projects.startScriptHint')}>
            <TextInput
              id="project-start-script"
              value={form.repoUrl}
              onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
              placeholder={t('projects.startScriptPlaceholder')}
              mono
            />
          </Field>
        ) : null}

        <Field label={t('projects.workingDir')} htmlFor="project-dir" hint={t('projects.workingDirHelp')}>
          <TextInput
            id="project-dir"
            value={form.workingDir}
            onChange={(e) => setForm((f) => ({ ...f, workingDir: e.target.value }))}
            placeholder={t('projects.workingDirAuto')}
            mono
          />
        </Field>

        <Field label={t('projects.description')} htmlFor="project-description">
          <Textarea
            id="project-description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder={t('projects.descriptionPlaceholder')}
          />
        </Field>
      </div>
    </Modal>
  )
}

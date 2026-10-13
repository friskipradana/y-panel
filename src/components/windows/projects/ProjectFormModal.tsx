import { FolderCode } from 'lucide-react'
import { TYPE_ICON, PROJECT_TYPES } from './projectsConfig'
import type { ProjectsWindowState } from './useProjectsWindow'
import { Button } from '@/components/ui/Button'
import { TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

export function ProjectFormModal({ pw }: { pw: ProjectsWindowState }) {
  const {
    t,
    showCreate,
    setShowCreate,
    editingProject,
    setEditingProject,
    form,
    setForm,
    createMut,
    updateMut,
  } = pw
  if (!((showCreate || editingProject))) return null

  return (
    <Modal
      open
      onClose={() => { setShowCreate(false); setEditingProject(null) }}
      title={editingProject ? 'Edit Project' : t('projects.newProject')}
      icon={<FolderCode />}
      width={520}
      footer={
        <>
          <Button type="button" onClick={() => { setShowCreate(false); setEditingProject(null) }} variant="ghost">{t('common.cancel')}</Button>
          <Button
            type="button"
            onClick={() => editingProject ? updateMut.mutate({ id: editingProject.id, payload: form }) : createMut.mutate(form)}
            disabled={createMut.isPending || updateMut.isPending || !form.name.trim()} variant="primary"
          >
            {createMut.isPending || updateMut.isPending ? t('projects.creating') : editingProject ? 'Simpan Project' : t('projects.createButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="panel-section-label">{t('projects.nameLabel')}</label>
          <TextInput
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('projects.appNamePlaceholder')}
            autoFocus
          />
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{t('projects.nameHelp')}</p>
        </div>
        <div>
          <label className="panel-section-label">{t('projects.runtimeType')}</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PROJECT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, projectType: t }))}
                className={[
                  'panel-btn justify-center rounded-[12px] px-2 py-2 text-[12px] font-medium capitalize shadow-none',
                  form.projectType === t ? 'panel-btn--primary-soft' : 'panel-btn--ghost',
                ].join(' ')}
              >
                {TYPE_ICON[t]} {t}
              </button>
            ))}
          </div>
        </div>
        <label className="panel-muted-block flex items-start gap-3 rounded-[14px] px-3 py-3 text-[12px] text-[var(--win-text)]">
          <input
            type="checkbox"
            checked={form.spaFallback}
            onChange={(event) => setForm((f) => ({ ...f, spaFallback: event.target.checked }))}
            className="mt-0.5"
          />
          <span>
            <span className="block font-semibold">SPA fallback ke index.html</span>
            <span className="mt-0.5 block leading-5 text-[var(--text-secondary)]">
              Aktifkan untuk React Router, Vue Router, atau frontend BrowserRouter agar refresh/direct URL tidak 404.
            </span>
          </span>
        </label>
        <div>
          <label className="panel-section-label">{t('projects.repoUrl')}</label>
          <TextInput
            value={form.repoUrl}
            onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
            placeholder={t('projects.gitUrlPlaceholder')} mono
          />
        </div>
        <div>
          <label className="panel-section-label">{t('projects.workingDir')}</label>
          <TextInput
            value={form.workingDir}
            onChange={(e) => setForm((f) => ({ ...f, workingDir: e.target.value }))}
            placeholder={t('projects.localPathPlaceholder')} mono
          />
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{t('projects.workingDirHelp')}</p>
        </div>
        <div>
          <label className="panel-section-label">{t('projects.description')}</label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder={t('projects.descriptionPlaceholder')}
          />
        </div>
      </div>
    </Modal>
  )
}

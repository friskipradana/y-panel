import { toast } from 'sonner'
import { FileCode, Play, Trash2 } from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { formatDateTimeID } from '@/lib/datetime'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ListState, ListRowIcon, ListTable } from '@/components/ui/ListTable'
import { DEFAULT_COMPOSE_YAML } from './constants'
import type { DockerWindowState } from './useDockerWindow'

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

export function TemplatesTab({ docker }: { docker: DockerWindowState }) {
  const { t, templatesQuery, filteredTemplates, narrowed, lists, showCreateTpl, setShowCreateTpl, tplForm, setTplForm, setShowDeploy, setDeployType, setDeployForm, deleteTemplateMut, createTemplateMut } = docker

  const facets = templatesQuery.data?.facets

  const close = () => {
    setShowCreateTpl(false)
    setTplForm({ name: '', description: '', yamlContent: DEFAULT_COMPOSE_YAML })
  }

  const create = () => {
    createTemplateMut.mutate(tplForm, {
      onSuccess: () => {
        toast.success(t('docker.templateCreated'))
        close()
      },
      onError: (e) => alertLib.fire(t('docker.templateCreateFailed'), apiError(e, t('docker.unknownError')), 'error', 'apps'),
    })
  }

  const remove = async (id: number, name: string) => {
    const ok = await alertLib.confirm(t('docker.deleteTemplate'), t('docker.deleteTemplateConfirm', { name }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
    if (!ok) return
    deleteTemplateMut.mutate(id, {
      onSuccess: () => toast.success(t('docker.templateDeleted', { name })),
      onError: (e) => alertLib.fire(t('docker.templateDeleteFailed'), apiError(e, t('docker.unknownError')), 'error', 'apps'),
    })
  }

  return (
    <>
      <Modal
        open={showCreateTpl}
        onClose={close}
        title={t('docker.createTemplateTitle')}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button type="button" variant="primary" loading={createTemplateMut.isPending} disabled={!tplForm.name.trim()} onClick={create}>
              {t('docker.saveTemplate')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('docker.templateName')}>
            <TextInput placeholder={t('docker.templateNamePlaceholder')} value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t('docker.description')}>
            <TextInput placeholder={t('docker.descriptionPlaceholder')} value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label={t('docker.composeYaml')}>
            <Textarea mono className="docker-modal__yaml" rows={10} value={tplForm.yamlContent} onChange={(e) => setTplForm((f) => ({ ...f, yamlContent: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ListTable
        variant="templates"
        empty={templatesQuery.isLoading || templatesQuery.isError || filteredTemplates.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          lists.templates.column('name', t('docker.col.template'), facets?.name),
          lists.templates.column('created', t('docker.col.created'), facets?.created),
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={templatesQuery.isLoading}
          error={templatesQuery.isError}
          errorTitle={t('docker.templatesLoadFailed')}
          errorHint={t('docker.agentAccessHint')}
          loadingText={t('docker.loadingList')}
          empty={filteredTemplates.length === 0}
          emptyIcon={<FileCode />}
          emptyTitle={narrowed ? t('docker.noResults') : t('docker.noTemplates')}
          emptyHint={narrowed ? undefined : t('docker.noTemplatesHint')}
        >
          {filteredTemplates.map((tmpl, idx) => (
            <div key={tmpl.id} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon><FileCode className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name" title={tmpl.name}>{tmpl.name}</span>
                  {tmpl.description ? <span className="docker-row__sub">{tmpl.description}</span> : null}
                </div>
              </div>
              <div className="docker-cell">{formatDateTimeID(tmpl.createdAt)}</div>
              <div className="docker-action-btns">
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--start"
                  title={t('docker.use')}
                  aria-label={t('docker.use')}
                  onClick={() => {
                    setDeployType('compose')
                    setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent }))
                    setShowDeploy(true)
                  }}
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--danger"
                  title={t('docker.deleteTemplate')}
                  aria-label={t('docker.deleteTemplate')}
                  disabled={deleteTemplateMut.isPending}
                  onClick={() => void remove(tmpl.id, tmpl.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </ListState>
      </ListTable>
    </>
  )
}

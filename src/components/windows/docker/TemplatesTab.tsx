import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import { formatDateTimeID } from '@/lib/datetime'
import { Play, Search, Plus, Trash2, Code } from 'lucide-react'
import { DEFAULT_COMPOSE_YAML } from './constants'
import type { DockerWindowState } from './useDockerWindow'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { Textarea, TextInput } from '@/components/ui/Field'
import { ListRow } from '@/components/ui/ListRow'
import { Modal } from '@/components/ui/Modal'

export function TemplatesTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    templatesData,
    tplSearch,
    setTplSearch,
    showCreateTpl,
    setShowCreateTpl,
    tplForm,
    setTplForm,
    setShowDeploy,
    setDeployType,
    setDeployForm,
    deleteTemplateMut,
    createTemplateMut,
  } = docker

    const allTpls = templatesData?.items ?? []
    const filteredTpls = allTpls.filter((t) => {
      const q = tplSearch.toLowerCase()
      return !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    })

    return (
      <div className="panel-window__stack">
        <Modal
          open={showCreateTpl}
          onClose={() => setShowCreateTpl(false)}
          title={t('docker.createTemplateTitle')}
          size="lg"
          footer={
            <>
            <Button type="button" variant="ghost" onClick={() => setShowCreateTpl(false)}>{t('common.cancel')}</Button>
            <Button
              type="button" variant="primary"
              disabled={createTemplateMut.isPending || !tplForm.name.trim()}
              onClick={async () => {
                await createTemplateMut.mutateAsync(tplForm)
                toast.success(t('docker.templateCreated'))
                setShowCreateTpl(false)
                setTplForm({ name: '', description: '', yamlContent: DEFAULT_COMPOSE_YAML })
              }}
            >
              {createTemplateMut.isPending ? t('common.saving') : t('docker.saveTemplate')}
            </Button>
            </>
          }
        >
            <div className="panel-field">
              <label className="panel-label">{t('docker.templateName')}</label>
              <TextInput placeholder={t('docker.templateNamePlaceholder')} value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="panel-field">
              <label className="panel-label">{t('docker.description')}</label>
              <TextInput placeholder={t('docker.descriptionPlaceholder')} value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="panel-field">
              <label className="panel-label">{t('docker.composeYaml')}</label>
              <Textarea mono className="docker-modal__yaml" rows={10} value={tplForm.yamlContent} onChange={(e) => setTplForm((f) => ({ ...f, yamlContent: e.target.value }))} />
            </div>
        </Modal>

        <div className="panel-table-container">
          <div className="docker-tab-toolbar">
            <div className="docker-tab-toolbar__left">
              <span className="docker-tab-toolbar__title">{t('docker.composeTemplates')}</span>
              <Badge>{allTpls.length}</Badge>
            </div>
            <div className="docker-tab-toolbar__right">
              <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => e.preventDefault()}>
                <Search className="h-3.5 w-3.5" />
                <input className="panel-search__input" placeholder={t('docker.searchTemplateShort')} value={tplSearch} onChange={(e) => setTplSearch(e.target.value)} />
              </form>
              <Button type="button" variant="primary" onClick={() => setShowCreateTpl(true)}>
                <Plus className="h-3.5 w-3.5" /> {t('docker.createTemplate')}
              </Button>
            </div>
          </div>
          {filteredTpls.length === 0 ? (
            <div className="panel-empty panel-empty--wide">
              <Code className="h-8 w-8" />
              <div className="text-sm font-medium text-[var(--win-text)]">{tplSearch ? t('docker.noResults') : t('docker.noTemplates')}</div>
            </div>
          ) : (
            <>
              {filteredTpls.map((tmpl) => (
                <ListRow
                  key={tmpl.id}
                  title={tmpl.name}
                  tag={tmpl.description && <Badge>{tmpl.description}</Badge>}
                  actions={<><Button
                        type="button" variant="primary-soft"
                        onClick={() => {
                          setDeployType('compose')
                          setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent }))
                          setShowDeploy(true)
                        }}
                      >
                        <Play className="h-3.5 w-3.5" /> {t('docker.use')}
                      </Button>
                      <IconButton
                        type="button" label={t('docker.deleteTemplate')} tone="danger"
                        onClick={async () => {
                          const ok = await alertLib.confirm(t('docker.deleteTemplate'), t('docker.deleteTemplateConfirm', { name: tmpl.name }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
                          if (ok) deleteTemplateMut.mutate(tmpl.id)
                        }}
                        disabled={deleteTemplateMut.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton></>}
                  details={<>{t('docker.created')} : {formatDateTimeID(tmpl.createdAt)}</>}
                />
              ))}
            </>
          )}
        </div>
      </div>
    )
}

import { useMemo } from 'react'
import { Boxes, FileCode, RefreshCw, Search } from 'lucide-react'
import type { DockerTemplate } from '@/types'
import { useI18n } from '@/lib/i18n'

interface TemplatesTabProps {
  templates: DockerTemplate[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  query: string
  setQuery: (v: string) => void
  onDeployTemplate: (template: DockerTemplate) => void
}

export function TemplatesTab({
  templates,
  isLoading,
  isError,
  error,
  search,
  setSearch,
  query,
  setQuery,
  onDeployTemplate,
}: TemplatesTabProps) {
  const { language, t } = useI18n()
  const filteredTemplates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return templates
    return templates.filter((template) => {
      return [template.name, template.description].some((value) => value?.toLowerCase().includes(needle))
    })
  }, [templates, search])

  return (
    <div className="panel-window__stack">
      <div className="panel-table-container">
        <div className="panel-toolbar panel-toolbar--search docker-toolbar-card">
          <form
            className="panel-search"
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(query.trim())
            }}
          >
            <Search className="h-4 w-4" />
            <input
              id="docker-templates-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="panel-search__input"
              placeholder={t('docker.searchTemplates')}
            />
            <button type="submit" className="panel-btn panel-btn--primary-soft">{t('docker.search')}</button>
          </form>
        </div>

        {isLoading ? (
          <div className="panel-loading">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('docker.loadingTemplates')}
          </div>
        ) : isError ? (
          <div className="panel-error-state">
            <FileCode className="h-5 w-5" />
            <div>
              <p className="font-semibold">{t('docker.templatesLoadFailed')}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="panel-empty panel-empty--wide">
            <Boxes className="h-8 w-8" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--win-text)]">{t('docker.noTemplatesMatch')}</div>
              <div>{t('docker.emptyTemplatesHint')}</div>
            </div>
          </div>
        ) : (
          <>
            {filteredTemplates.map((template) => (
              <div key={template.id} className="panel-table-row">
                <div className="docker-template-row__main">
                  <div className="docker-container-row__header">
                    <div className="docker-container-card__title-wrap">
                      <div className="docker-container-card__title-row">
                        <span className="docker-container-card__title">{template.name}</span>
                        <span className="docker-inline-code">{t('docker.chars', { count: template.yamlContent.length })}</span>
                      </div>
                    </div>
                    {template.description && (
                      <div className="docker-container-card__subtitle">{template.description}</div>
                    )}
                    <div className="docker-container-card__meta-row">
                      <span>{t('docker.created', { date: template.createdAt ? new Date(template.createdAt).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US') : '-' })}</span>
                    </div>
                  </div>
                  <div className="docker-container-row__actions">
                    <button
                      type="button"
                      className="panel-btn panel-btn--primary-soft"
                      onClick={() => onDeployTemplate(template)}
                    >
                      {t('docker.deploy')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}





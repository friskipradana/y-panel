import { useMemo } from 'react'
import { Boxes, FileDown, HardDrive, Image as ImageIcon, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { DockerImage } from '@/types'
import { useI18n } from '@/lib/i18n'

interface ImagesTabProps {
  images: DockerImage[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  search: string
  setSearch: (v: string) => void
  query: string
  setQuery: (v: string) => void
  deleteImageMutation: any
  pruneImagesMutation: any
  onPullImage: () => void
}

export function ImagesTab({
  images,
  isLoading,
  isError,
  error,
  search,
  setSearch,
  query,
  setQuery,
  deleteImageMutation,
  pruneImagesMutation,
  onPullImage,
}: ImagesTabProps) {
  const { t } = useI18n()
  const filteredImages = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return images
    return images.filter((image) => {
      return [image.Repository, image.Tag, image.Size, image.Id, image.CreatedAt].some(
        (value) => value?.toLowerCase().includes(needle)
      )
    })
  }, [images, search])

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
              id="docker-images-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="panel-search__input"
              placeholder={t('docker.searchImages')}
            />
            <button type="submit" className="panel-btn panel-btn--primary-soft">{t('docker.search')}</button>
          </form>
          <div className="docker-toolbar-buttons">
            <button
              type="button"
              className="panel-btn panel-btn--primary-soft"
              onClick={onPullImage}
            >
              <FileDown className="h-3.5 w-3.5" />
              {t('docker.pullImage')}
            </button>
            <button
              type="button"
              className="panel-btn panel-btn--ghost"
              onClick={() => pruneImagesMutation.mutate()}
              disabled={pruneImagesMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('docker.pruneUnused')}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="panel-loading">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('docker.loadingImages')}
          </div>
        ) : isError ? (
          <div className="panel-error-state">
            <ImageIcon className="h-5 w-5" />
            <div>
              <p className="font-semibold">{t('docker.imagesLoadFailed')}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-90">{(error as Error).message}</p>
              <p className="mt-1 text-[12px] leading-6 opacity-80">{t('docker.runtimeAccessHint')}</p>
            </div>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="panel-empty panel-empty--wide">
            <Boxes className="h-8 w-8" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--win-text)]">{t('docker.noImagesMatch')}</div>
              <div>{t('docker.emptyImagesHint')}</div>
            </div>
          </div>
        ) : (
          <>
            {filteredImages.map((image) => {
              return (
                <div key={image.Id} className="panel-table-row">
                  <div className="docker-image-row__main">
                    <div className="docker-container-row__header">
                      <div className="docker-container-card__title-wrap">
                        <div className="docker-container-card__title-row">
                          <span className="docker-container-card__title">{image.Repository}:{image.Tag}</span>
                          <span className="docker-inline-code">ID {image.Id.slice(7, 19)}</span>
                        </div>
                        <div className="docker-container-card__meta-row">
                          <HardDrive className="h-3.5 w-3.5 opacity-70" />
                          <span className="docker-inline-code">{image.Size}</span>
                          <span className="docker-inline-dot" />
                          <span>{image.CreatedAt || '-'}</span>
                          {(image.OwnerNames ?? []).length > 0 && (
                            <>
                              <span className="docker-inline-dot" />
                              <span className="docker-inline-code">
                                {t('docker.owner')}: {(image.OwnerNames ?? []).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="docker-container-row__actions">
                        <button
                          type="button"
                          className="panel-icon-btn text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-hover)]"
                          onClick={() => deleteImageMutation.mutate(image.Id)}
                          disabled={deleteImageMutation.isPending}
                          title={t('docker.deleteImage')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}





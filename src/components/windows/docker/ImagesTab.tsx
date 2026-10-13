import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import { formatDateTimeID } from '@/lib/datetime'
import { Search, Plus, Trash2, Box } from 'lucide-react'
import { DockerProgressOverlay } from './DockerProgressOverlay'
import type { DockerWindowState } from './useDockerWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Pagination } from '@/components/ui/Pagination'
import { TextInput } from '@/components/ui/Field'
import { ListRow } from '@/components/ui/ListRow'
import { Modal } from '@/components/ui/Modal'

export function ImagesTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    imagesData,
    refetchImages,
    imgSearch,
    setImgSearch,
    imgPage,
    setImgPage,
    IMG_PAGE_SIZE,
    showPullImage,
    setShowPullImage,
    pullImageForm,
    setPullImageForm,
    resetPullImageModal,
    pullImageMut,
    deleteImageMut,
  } = docker

    const allImgs = imagesData?.items ?? []
    const filteredImgs = allImgs.filter((img) => {
      const q = imgSearch.toLowerCase()
      return !q || img.Repository.toLowerCase().includes(q) || img.Tag.toLowerCase().includes(q) || img.Id.toLowerCase().includes(q)
    })
    const totalPages = Math.max(1, Math.ceil(filteredImgs.length / IMG_PAGE_SIZE))
    const pagedImgs = filteredImgs.slice((imgPage - 1) * IMG_PAGE_SIZE, imgPage * IMG_PAGE_SIZE)

    return (
      <div className="panel-window__stack">
        <div className="panel-table-container">
          <div className="docker-tab-toolbar">
            <div className="docker-tab-toolbar__left">
              <span className="docker-tab-toolbar__title">{t('docker.localImages')}</span>
              <Badge>{allImgs.length}</Badge>
            </div>
            <div className="docker-tab-toolbar__right">
              <form className="panel-search docker-tab-toolbar__search" onSubmit={(e) => { e.preventDefault(); setImgPage(1) }}>
                <Search className="h-3.5 w-3.5" />
                <input className="panel-search__input" placeholder={t('docker.searchImageShort')} value={imgSearch} onChange={(e) => { setImgSearch(e.target.value); setImgPage(1) }} />
              </form>
              <Button type="button" variant="primary-soft" onClick={() => setShowPullImage(true)} disabled={pullImageMut.isPending}>
                <Plus className="h-3.5 w-3.5" /> {t('docker.pullImage')}
              </Button>
            </div>
          </div>

          {/* Pull Image Modal */}
          <Modal
            open={showPullImage}
            onClose={resetPullImageModal}
            title={t('docker.pullDockerImage')}
            size="lg"
            busyOverlay={pullImageMut.isPending && (
                  <DockerProgressOverlay
                    title={t('docker.pullDockerImage')}
                    subtitle={pullImageForm.image.trim()}
                    type="pull"
                  />
                )}
            footer={
              <>
              <Button type="button" variant="ghost" onClick={resetPullImageModal}>{t('common.cancel')}</Button>
              <Button
                type="button" variant="primary"
                disabled={pullImageMut.isPending || !pullImageForm.image.trim()}
                onClick={() => {
                  pullImageMut.mutate(
                    {
                      image: pullImageForm.image.trim(),
                      registryAuth: pullImageForm.registryAuth.enabled
                        ? { enabled: true, registry: pullImageForm.registryAuth.registry || undefined, usernameOrEmail: pullImageForm.registryAuth.usernameOrEmail, password: pullImageForm.registryAuth.password }
                        : undefined,
                    },
                    {
                      onSuccess: () => { toast.success(t('docker.imagePulled', { image: pullImageForm.image.trim() })); resetPullImageModal(); void refetchImages() },
                      onError: (e: any) => alertLib.fire(t('docker.pullImageFailed'), e.response?.data?.error || t('docker.unknownError'), 'error', 'apps'),
                    },
                  )
                }}
              >
                {pullImageMut.isPending ? t('docker.pulling') : t('docker.pullImage')}
              </Button>
              </>
            }
          >
              <div className="panel-field">
                <label className="panel-label">{t('docker.imageRequired')}</label>
                <TextInput placeholder={t('docker.pullImagePlaceholder')} value={pullImageForm.image} onChange={(e) => setPullImageForm((c) => ({ ...c, image: e.target.value }))} />
              </div>
              <div className="docker-auth-block">
                <label className="docker-save-tpl-check">
                  <input type="checkbox" checked={pullImageForm.registryAuth.enabled} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, enabled: e.target.checked } }))} />
                  <span>{t('docker.useRegistryAuth')}</span>
                </label>
                {pullImageForm.registryAuth.enabled && (
                  <div className="docker-auth-grid">
                    <div className="panel-field">
                      <label className="panel-label">{t('docker.registry')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
                      <TextInput placeholder={t('docker.registryPlaceholder')} value={pullImageForm.registryAuth.registry} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, registry: e.target.value } }))} />
                    </div>
                    <div className="panel-field">
                      <label className="panel-label">{t('docker.usernameEmailRequired')}</label>
                      <TextInput placeholder={t('docker.usernameEmailPlaceholder')} value={pullImageForm.registryAuth.usernameOrEmail} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, usernameOrEmail: e.target.value } }))} />
                    </div>
                    <div className="panel-field docker-auth-grid__full">
                      <label className="panel-label">{t('docker.passwordRequired')}</label>
                      <TextInput type="password" placeholder={t('docker.passwordPlaceholder')} value={pullImageForm.registryAuth.password} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, password: e.target.value } }))} />
                    </div>
                  </div>
                )}
              </div>
          </Modal>

          {pagedImgs.length === 0 ? (
            <div className="panel-empty panel-empty--wide">
              <Box className="h-8 w-8" />
              <div className="text-sm font-medium text-[var(--win-text)]">{imgSearch ? t('docker.noResults') : t('docker.noLocalImages')}</div>
            </div>
          ) : (
            <>
              {pagedImgs.map((img) => (
                <ListRow
                  key={img.Id}
                  title={img.Repository}
                  tag={<Badge>{img.Tag}</Badge>}
                  actions={<><IconButton
                      type="button" label={t('docker.deleteImage')} tone="danger"
                      onClick={async () => {
                        const imageLabel = `${img.Repository}:${img.Tag}`
                        const ok = await alertLib.confirm(t('docker.deleteImage'), t('docker.deleteImageConfirm', { image: imageLabel }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
                        if (!ok) return
                        deleteImageMut.mutate(img.Id, {
                          onSuccess: () => { toast.success(t('docker.imageDeleted', { image: imageLabel })); void refetchImages() },
                          onError: (e: any) => alertLib.fire(t('docker.deleteImageFailed'), e.response?.data?.error || t('docker.imageDeleteFailed'), 'error', 'apps'),
                        })
                      }}
                      disabled={deleteImageMut.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton></>}
                  details={<>ID : {img.Id.slice(0, 12)}<br />
                      {t('docker.size')} : {img.Size}<br />
                      {t('docker.createdLabel')} : {formatDateTimeID(img.CreatedAt)}</>}
                />
              ))}
            </>
          )}
          <Pagination page={imgPage} totalPages={totalPages} onChange={setImgPage} />
        </div>
      </div>
    )
}

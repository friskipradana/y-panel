import { toast } from 'sonner'
import { Box, CircleArrowUp, Play, Trash2 } from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ListState, ListRowIcon, ListTable } from '@/components/ui/ListTable'
import { formatDockerDate } from './constants'
import type { DockerWindowState } from './useDockerWindow'

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

export function ImagesTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    imagesQuery,
    filteredImages,
    narrowed,
    lists,
    refetchImages,
    showPullImage,
    resetPullImageModal,
    pullImageForm,
    setPullImageForm,
    setUpdateTarget,
    deleteImageMut,
    deployFromImage,
  } = docker

  const facets = imagesQuery.data?.facets

  const pull = () => {
    const image = pullImageForm.image.trim()
    const auth = pullImageForm.registryAuth
    // the download is shown with what Docker prints, in the update window
    setUpdateTarget({
      kind: 'image',
      image,
      registryAuth: auth.enabled ? { enabled: true, registry: auth.registry || undefined, usernameOrEmail: auth.usernameOrEmail, password: auth.password } : undefined,
      autoStart: true,
    })
    resetPullImageModal()
  }

  const remove = async (id: string, label: string) => {
    const ok = await alertLib.confirm(t('docker.deleteImage'), t('docker.deleteImageConfirm', { image: label }), t('docker.delete'), t('common.cancel'), 'warning', 'apps')
    if (!ok) return
    deleteImageMut.mutate(id, {
      onSuccess: () => {
        toast.success(t('docker.imageDeleted', { image: label }))
        void refetchImages()
      },
      onError: (e) => alertLib.fire(t('docker.deleteImageFailed'), apiError(e, t('docker.imageDeleteFailed')), 'error', 'apps'),
    })
  }

  return (
    <>
      <Modal
        open={showPullImage}
        onClose={resetPullImageModal}
        title={t('docker.pullDockerImage')}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={resetPullImageModal}>{t('common.cancel')}</Button>
            <Button type="button" variant="primary" disabled={!pullImageForm.image.trim()} onClick={pull}>
              {t('docker.pullImage')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('docker.imageRequired')}>
            <TextInput mono placeholder={t('docker.pullImagePlaceholder')} value={pullImageForm.image} onChange={(e) => setPullImageForm((c) => ({ ...c, image: e.target.value }))} />
          </Field>
          <div className="docker-auth-block">
            <Checkbox
              checked={pullImageForm.registryAuth.enabled}
              onChange={(checked) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, enabled: checked } }))}
              label={t('docker.useRegistryAuth')}
            />
            {pullImageForm.registryAuth.enabled && (
              <div className="docker-auth-grid">
                <Field label={`${t('docker.registry')} ${t('docker.optional')}`}>
                  <TextInput mono placeholder={t('docker.registryPlaceholder')} value={pullImageForm.registryAuth.registry} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, registry: e.target.value } }))} />
                </Field>
                <Field label={t('docker.usernameEmailRequired')}>
                  <TextInput placeholder={t('docker.usernameEmailPlaceholder')} value={pullImageForm.registryAuth.usernameOrEmail} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, usernameOrEmail: e.target.value } }))} />
                </Field>
                <div className="docker-auth-grid__full">
                  <Field label={t('docker.passwordRequired')}>
                    <TextInput type="password" autoComplete="off" placeholder={t('docker.passwordPlaceholder')} value={pullImageForm.registryAuth.password} onChange={(e) => setPullImageForm((c) => ({ ...c, registryAuth: { ...c.registryAuth, password: e.target.value } }))} />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ListTable
        variant="images"
        empty={imagesQuery.isLoading || imagesQuery.isError || filteredImages.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          lists.images.column('name', t('docker.col.image'), facets?.name),
          lists.images.column('usage', t('docker.col.usage'), facets?.usage, { labelOf: (v) => (v === 'in-use' ? t('docker.inUse') : t('docker.unused')) }),
          lists.images.column('size', t('docker.col.size'), facets?.size),
          lists.images.column('created', t('docker.col.created'), facets?.created),
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={imagesQuery.isLoading}
          error={imagesQuery.isError}
          errorTitle={t('docker.imagesLoadFailed')}
          errorHint={t('docker.agentAccessHint')}
          loadingText={t('docker.loadingList')}
          empty={filteredImages.length === 0}
          emptyIcon={<Box />}
          emptyTitle={narrowed ? t('docker.noResults') : t('docker.noLocalImages')}
          emptyHint={narrowed ? undefined : t('docker.noLocalImagesHint')}
        >
          {filteredImages.map((img, idx) => {
            const label = `${img.Repository}:${img.Tag}`
            const inUse = !!img.inUse
            const untagged = img.Repository === '<none>' || img.Tag === '<none>'
            return (
              <div key={img.Id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Box className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={label}>{img.Repository}</span>
                    <span className="docker-row__sub">{img.Tag} · {img.Id.replace('sha256:', '').slice(0, 12)}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--keep">
                  <span className={`docker-status-pill ${inUse ? 'docker-status-pill--running' : 'docker-status-pill--exited'}`}>
                    <span className="docker-status-dot" />
                    <span>{inUse ? t('docker.inUse') : t('docker.unused')}</span>
                  </span>
                </div>
                <div className="docker-cell docker-cell--mono">{img.Size}</div>
                <div className="docker-cell">{formatDockerDate(img.CreatedAt)}</div>
                <div className="docker-action-btns">
                  <button type="button" className="docker-act-btn" title={t('docker.update.imageAction')} aria-label={t('docker.update.imageAction')} disabled={untagged} onClick={() => setUpdateTarget({ kind: 'image', image: label })}>
                    <CircleArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn docker-act-btn--start" title={t('docker.deployFromImage')} aria-label={t('docker.deployFromImage')} disabled={untagged} onClick={() => deployFromImage(label)}>
                    <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={inUse ? t('docker.imageInUseHint') : t('docker.deleteImage')}
                    aria-label={t('docker.deleteImage')}
                    disabled={deleteImageMut.isPending || inUse}
                    onClick={() => void remove(img.Id, label)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    </>
  )
}

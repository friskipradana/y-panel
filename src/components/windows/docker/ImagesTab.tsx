import { toast } from 'sonner'
import { Box, Play, Trash2 } from 'lucide-react'
import { alertLib } from '@/lib/alert'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { DockerProgressOverlay } from './DockerProgressOverlay'
import { DockerListState, DockerRowIcon, DockerTable } from './DockerTable'
import { formatDockerDate, isImageInUse } from './constants'
import type { DockerWindowState } from './useDockerWindow'

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

export function ImagesTab({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    imagesQuery,
    filteredImages,
    imagesInUse,
    search,
    refetchImages,
    showPullImage,
    resetPullImageModal,
    pullImageForm,
    setPullImageForm,
    pullImageMut,
    deleteImageMut,
    deployFromImage,
  } = docker

  const pull = () => {
    const image = pullImageForm.image.trim()
    const auth = pullImageForm.registryAuth
    pullImageMut.mutate(
      {
        image,
        registryAuth: auth.enabled ? { enabled: true, registry: auth.registry || undefined, usernameOrEmail: auth.usernameOrEmail, password: auth.password } : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('docker.imagePulled', { image }))
          resetPullImageModal()
          void refetchImages()
        },
        onError: (e) => alertLib.fire(t('docker.pullImageFailed'), apiError(e, t('docker.unknownError')), 'error', 'apps'),
      },
    )
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
        busyOverlay={pullImageMut.isPending && <DockerProgressOverlay title={t('docker.pullDockerImage')} subtitle={pullImageForm.image.trim()} type="pull" />}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={resetPullImageModal}>{t('common.cancel')}</Button>
            <Button type="button" variant="primary" loading={pullImageMut.isPending} disabled={!pullImageForm.image.trim()} onClick={pull}>
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

      <DockerTable
        variant="images"
        empty={imagesQuery.isLoading || imagesQuery.isError || filteredImages.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('docker.col.image') },
          { label: t('docker.col.usage') },
          { label: t('docker.col.size') },
          { label: t('docker.col.created') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <DockerListState
          loading={imagesQuery.isLoading}
          error={imagesQuery.isError}
          errorTitle={t('docker.imagesLoadFailed')}
          errorHint={t('docker.agentAccessHint')}
          loadingText={t('docker.loadingList')}
          empty={filteredImages.length === 0}
          emptyIcon={<Box />}
          emptyTitle={search ? t('docker.noResults') : t('docker.noLocalImages')}
          emptyHint={search ? undefined : t('docker.noLocalImagesHint')}
        >
          {filteredImages.map((img, idx) => {
            const label = `${img.Repository}:${img.Tag}`
            const inUse = isImageInUse(img, imagesInUse)
            const untagged = img.Repository === '<none>' || img.Tag === '<none>'
            return (
              <div key={img.Id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <DockerRowIcon><Box className="h-3.5 w-3.5" strokeWidth={1.75} /></DockerRowIcon>
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
        </DockerListState>
      </DockerTable>
    </>
  )
}

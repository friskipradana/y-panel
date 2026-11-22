import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { MODAL_ICONS } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

const BITS = [
  { bit: 4, label: 'fileManager.read' },
  { bit: 2, label: 'fileManager.write' },
  { bit: 1, label: 'fileManager.execute' },
] as const

const parseOctal = (value: string) => {
  const [u, g, o] = value.padStart(3, '0').slice(-3).split('').map(Number)
  return { u: u || 0, g: g || 0, o: o || 0 }
}

// Every dialog of the File Manager: new file or folder, rename, permissions, compress, extract, delete
export function FileActionModal({ fm }: { fm: FileManagerState }) {
  const {
    t,
    modal,
    setModal,
    modalInput,
    setModalInput,
    modalPathInput,
    setModalPathInput,
    chmodMode,
    setChmodMode,
    chmodRecursive,
    setChmodRecursive,
    modalLoading,
    executeModal,
    joinPath,
    activeTab,
  } = fm

  if (!modal) return null

  const item = 'item' in modal ? modal.item : undefined
  const type = modal.type
  const destructive = type === 'delete'
  const close = () => setModal(null)
  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void executeModal()
  }

  const toggleBit = (position: 'u' | 'g' | 'o', bit: number) => {
    const mode = parseOctal(chmodMode.substring(1))
    mode[position] = (mode[position] & bit) === bit ? mode[position] - bit : mode[position] + bit
    setChmodMode(`0${mode.u}${mode.g}${mode.o}`)
  }

  const owners = { u: t('fileManager.owner'), g: t('fileManager.group'), o: t('fileManager.public') }
  const needsName = ['rename', 'mkdir', 'touch', 'compress'].includes(type)

  return (
    <Modal
      open
      onClose={close}
      title={t(`fileManager.modal.${type}.title`)}
      subtitle={t(`fileManager.modal.${type}.description`, { name: item?.name ?? '' })}
      icon={MODAL_ICONS[type]}
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={modalLoading} onClick={close}>{t('common.cancel')}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} loading={modalLoading} onClick={() => void executeModal()}>
            {t(`fileManager.modal.${type}.confirm`)}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {needsName ? (
          <Field label={t(type === 'compress' ? 'fileManager.archiveName' : type === 'mkdir' ? 'fileManager.folderName' : type === 'touch' ? 'fileManager.fileName' : 'fileManager.newName')} htmlFor="file-modal-name">
            <TextInput id="file-modal-name" mono autoFocus value={modalInput} placeholder={type === 'rename' ? item?.name : t('fileManager.typeHere')} onChange={(e) => setModalInput(e.target.value)} onKeyDown={submitOnEnter} />
          </Field>
        ) : null}

        {type === 'extract' && item ? (
          <>
            <Field label={t('fileManager.destinationDirectory')} htmlFor="file-modal-dest">
              <TextInput id="file-modal-dest" mono autoFocus value={modalPathInput} placeholder={t('fileManager.destinationDirectoryPlaceholder')} onChange={(e) => setModalPathInput(e.target.value)} />
            </Field>
            <Field label={t('fileManager.extractFolderName')} htmlFor="file-modal-folder">
              <TextInput id="file-modal-folder" mono value={modalInput} placeholder={t('fileManager.extractFolderNamePlaceholder')} onChange={(e) => setModalInput(e.target.value)} onKeyDown={submitOnEnter} />
            </Field>
            <p className="panel-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12px] break-all">
              {item.path} &rarr; {joinPath(modalPathInput || activeTab.currentPath, modalInput || t('fileManager.destinationFolderFallback'))}
            </p>
          </>
        ) : null}

        {type === 'chmod' && item ? (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {(['u', 'g', 'o'] as const).map((position) => {
                const value = parseOctal(chmodMode.substring(1))[position]
                return (
                  <fieldset key={position} className="space-y-2 rounded-lg border border-[var(--win-border)] p-3">
                    <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--panel-primary-text)]">{owners[position]}</legend>
                    {BITS.map(({ bit, label }) => (
                      <Checkbox key={bit} checked={(value & bit) === bit} onChange={() => toggleBit(position, bit)} label={t(label)} />
                    ))}
                  </fieldset>
                )
              })}
            </div>
            <div className="flex items-end justify-between gap-3">
              <Field label={t('fileManager.octal')} htmlFor="file-modal-octal" hint={t('fileManager.octalHint')} className="w-32">
                <TextInput id="file-modal-octal" mono value={chmodMode} maxLength={4} inputMode="numeric" onChange={(e) => setChmodMode(e.target.value.replace(/[^0-7]/g, ''))} onKeyDown={submitOnEnter} />
              </Field>
              {item.isDir ? <Checkbox tone="warning" checked={chmodRecursive} onChange={setChmodRecursive} label={t('fileManager.applyRecursive')} /> : null}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}

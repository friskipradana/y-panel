import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { ImagePickButton } from '@/components/common/ImageAttach'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { uploadImageRef } from '@/hooks/useImageAttachments'
import type { ElementEdit, PickedElement } from './previewBridge'

// The picked element: change its text, picture or link right away, or describe the change to the AI in the box below
export function StudioElementEditor({
  element,
  onEdit,
  onClose,
  t,
}: {
  element: PickedElement
  onEdit: (edit: ElementEdit) => void
  onClose: () => void
  t: (key: string) => string
}) {
  const [text, setText] = useState(element.text ?? '')
  const [href, setHref] = useState(element.href ?? '')
  const [uploading, setUploading] = useState(false)

  const replaceImage = async (files: File[]) => {
    if (!files[0]) return
    setUploading(true)
    try {
      onEdit({ src: (await uploadImageRef(files[0])).url })
    } catch {
      toast.error(t('docs.imageFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--panel-primary-border)] bg-[var(--panel-surface)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone="primary" size="sm">{`<${element.tag}>`}</Badge>
          <span className="truncate text-xs text-[var(--text-secondary)]">{(element.text ?? '').trim() || element.src || t('studio.pick.block')}</span>
        </div>
        <IconButton size="sm" label={t('studio.pick.clear')} onClick={onClose}>
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>

      {element.text !== null && element.text.trim() ? (
        <div className="space-y-1.5">
          <Field label={t('studio.pick.text')}>
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button size="sm" variant="outline" icon={<Check className="h-3 w-3" strokeWidth={1.75} />} disabled={text === element.text} onClick={() => onEdit({ text })}>
            {t('studio.pick.applyText')}
          </Button>
        </div>
      ) : null}

      {element.src !== null ? (
        <div className="flex items-center gap-2">
          <ImagePickButton multiple={false} busy={uploading} label={t('studio.pick.replaceImage')} onFiles={(f) => void replaceImage(f)} />
          <span className="text-xs text-[var(--win-text)]">{t('studio.pick.replaceImage')}</span>
        </div>
      ) : null}

      {element.href !== null ? (
        <div className="space-y-1.5">
          <Field label={t('studio.pick.link')}>
            <TextInput mono value={href} onChange={(e) => setHref(e.target.value)} />
          </Field>
          <Button size="sm" variant="outline" icon={<Check className="h-3 w-3" strokeWidth={1.75} />} disabled={href === element.href} onClick={() => onEdit({ href })}>
            {t('studio.pick.applyLink')}
          </Button>
        </div>
      ) : null}

      <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('studio.pick.askHint')}</p>
    </div>
  )
}

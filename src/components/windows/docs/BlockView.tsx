import { useState } from 'react'
import { toast } from 'sonner'
import { ImagePickButton } from '@/components/common/ImageAttach'
import { Textarea, TextInput } from '@/components/ui/Field'
import { uploadImageRef } from '@/hooks/useImageAttachments'
import { resolveImageSrc } from '@/lib/markdown'
import { makeBlock, type DocBlock } from './blocks'
import { RichText } from './RichText'

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-bold tracking-tight',
  2: 'text-lg font-bold tracking-tight',
  3: 'text-[0.9375rem] font-semibold',
  4: 'text-[0.875rem] font-semibold',
}

export interface BlockActions {
  patch: (id: string, next: Partial<DocBlock>) => void
  /** adds a block under this one and puts the cursor in it */
  insertAfter: (id: string, block: DocBlock, focus?: string) => void
  remove: (id: string) => void
  focus: (key: string) => void
  addImages: (files: File[], afterId: string) => void
}

function ImageBlock({ block, actions, t }: { block: DocBlock; actions: BlockActions; t: (key: string) => string }) {
  const [uploading, setUploading] = useState(false)
  const src = resolveImageSrc(block.url)

  const replace = async (files: File[]) => {
    if (!files[0]) return
    setUploading(true)
    try {
      actions.patch(block.id, { url: (await uploadImageRef(files[0])).url })
    } catch {
      toast.error(t('docs.imageFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <figure className="space-y-1.5 px-2">
      {src ? (
        <img src={src} alt={block.text} className="mx-auto block max-h-80 max-w-full rounded-xl border border-[var(--win-border)]" />
      ) : (
        <p className="panel-mono break-all text-[0.75rem] text-[var(--text-secondary)]">{block.url}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            value={block.text}
            data-focus-key={block.id}
            aria-label={t('docs.block.caption')}
            placeholder={t('docs.block.caption')}
            onChange={(e) => actions.patch(block.id, { text: e.target.value })}
          />
        </div>
        <ImagePickButton multiple={false} busy={uploading} label={t('studio.pick.replaceImage')} onFiles={(f) => void replace(f)} />
      </div>
    </figure>
  )
}

// One block of the article, edited in the shape it will be read in
export function BlockView({ block, actions, t }: { block: DocBlock; actions: BlockActions; t: (key: string) => string }) {
  const next = () => {
    const paragraph = makeBlock('paragraph')
    actions.insertAfter(block.id, paragraph, paragraph.id)
  }
  const text = (placeholder: string, className = '') => (
    <RichText
      focusKey={block.id}
      value={block.text}
      label={placeholder}
      placeholder={placeholder}
      className={className}
      onChange={(value) => actions.patch(block.id, { text: value })}
      onEnter={next}
      onRemove={() => actions.remove(block.id)}
      onFiles={(files) => actions.addImages(files, block.id)}
    />
  )

  switch (block.type) {
    case 'heading':
      return text(t('docs.block.heading'), HEADING_CLASS[block.level])
    case 'quote':
      return <div className="border-l-2 border-[var(--panel-primary-border)] pl-1 text-[var(--text-secondary)]">{text(t('docs.block.quote'))}</div>
    case 'bullets':
    case 'numbers': {
      const List = block.type === 'numbers' ? 'ol' : 'ul'
      const setItems = (items: string[]) => actions.patch(block.id, { items })
      return (
        <List className={`space-y-0.5 pl-6 ${block.type === 'numbers' ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, n) => (
            <li key={`${block.id}-${n}`}>
              <RichText
                focusKey={n === 0 ? block.id : `${block.id}:${n}`}
                value={item}
                label={t('docs.block.item')}
                placeholder={t('docs.block.item')}
                onChange={(value) => setItems(block.items.map((it, i) => (i === n ? value : it)))}
                onEnter={() => {
                  // Enter on an empty last item leaves the list
                  if (!item.trim() && n === block.items.length - 1) {
                    setItems(block.items.slice(0, -1))
                    next()
                    return
                  }
                  setItems([...block.items.slice(0, n + 1), '', ...block.items.slice(n + 1)])
                  actions.focus(`${block.id}:${n + 1}`)
                }}
                onRemove={() => {
                  if (block.items.length === 1) {
                    actions.remove(block.id)
                    return
                  }
                  setItems(block.items.filter((_, i) => i !== n))
                  actions.focus(n <= 1 ? block.id : `${block.id}:${n - 1}`)
                }}
              />
            </li>
          ))}
        </List>
      )
    }
    case 'code':
    case 'raw':
      return (
        <div className="space-y-1 px-2">
          {block.type === 'raw' ? <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('docs.block.rawHint')}</p> : null}
          <Textarea
            mono
            data-focus-key={block.id}
            aria-label={t(block.type === 'raw' ? 'docs.block.raw' : 'docs.block.code')}
            rows={Math.min(14, Math.max(3, block.text.split('\n').length))}
            value={block.text}
            onChange={(e) => actions.patch(block.id, { text: e.target.value })}
          />
        </div>
      )
    case 'image':
      return <ImageBlock block={block} actions={actions} t={t} />
    case 'divider':
      return <hr className="mx-2 my-3 border-[var(--win-border)]" />
    default:
      return text(t('docs.block.paragraphPh'))
  }
}

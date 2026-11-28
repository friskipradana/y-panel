import { useEffect, useRef, useState } from 'react'
import { Heading2, List, ListOrdered, Minus, Pilcrow, Quote, SquareCode } from 'lucide-react'
import { toast } from 'sonner'
import { ImagePickButton } from '@/components/common/ImageAttach'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Button } from '@/components/ui/Button'
import { imageFilesOf, uploadImageRef } from '@/hooks/useImageAttachments'
import { blocksToMarkdown, makeBlock, parseMarkdown, type BlockType, type DocBlock } from './blocks'
import { BlockView, type BlockActions } from './BlockView'
import { InlineToolbar } from './InlineToolbar'

const ADD: Array<{ type: BlockType; Icon: typeof Pilcrow; key: string }> = [
  { type: 'paragraph', Icon: Pilcrow, key: 'docs.block.paragraph' },
  { type: 'heading', Icon: Heading2, key: 'docs.block.heading' },
  { type: 'bullets', Icon: List, key: 'docs.fmt.bullets' },
  { type: 'numbers', Icon: ListOrdered, key: 'docs.fmt.numbers' },
  { type: 'quote', Icon: Quote, key: 'docs.block.quote' },
  { type: 'code', Icon: SquareCode, key: 'docs.block.code' },
  { type: 'divider', Icon: Minus, key: 'docs.block.divider' },
]

const withStarter = (blocks: DocBlock[]) => (blocks.length > 0 ? blocks : [makeBlock('paragraph')])

// Visual article editor: headings, lists and pictures are edited as they will be read; the saved text stays Markdown
export function BlockEditor({ value, onChange, t }: { value: string; onChange: (next: string) => void; t: (key: string) => string }) {
  const [blocks, setBlocks] = useState(() => withStarter(parseMarkdown(value)))
  const [uploading, setUploading] = useState(false)
  const blocksRef = useRef(blocks)
  const emitted = useRef(value)
  const pendingFocus = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const commit = (next: DocBlock[]) => {
    blocksRef.current = withStarter(next)
    setBlocks(blocksRef.current)
    emitted.current = blocksToMarkdown(blocksRef.current)
    onChange(emitted.current)
  }

  // text that changed outside the editor (an AI revision, another article) is read again
  useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    blocksRef.current = withStarter(parseMarkdown(value))
    setBlocks(blocksRef.current)
  }, [value])

  useEffect(() => {
    if (!pendingFocus.current) return
    rootRef.current?.querySelector<HTMLElement>(`[data-focus-key="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  })

  const insertAt = (index: number, added: DocBlock[]) => {
    const current = blocksRef.current
    commit([...current.slice(0, index), ...added, ...current.slice(index)])
  }
  const indexOf = (id: string) => blocksRef.current.findIndex((b) => b.id === id)

  const addImages = async (files: File[], afterId?: string) => {
    if (files.length === 0) return
    setUploading(true)
    for (const file of files) {
      try {
        const ref = await uploadImageRef(file)
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')
        const at = afterId ? indexOf(afterId) : -1
        const block = makeBlock('image', { url: ref.url, text: alt })
        insertAt(at >= 0 ? at + 1 : blocksRef.current.length, [block])
        afterId = block.id
      } catch {
        toast.error(t('docs.imageFailed'))
      }
    }
    setUploading(false)
  }

  const actions: BlockActions = {
    patch: (id, next) => commit(blocksRef.current.map((b) => (b.id === id ? { ...b, ...next } : b))),
    insertAfter: (id, block, focus) => {
      pendingFocus.current = focus ?? null
      insertAt(indexOf(id) + 1, [block])
    },
    remove: (id) => {
      const at = indexOf(id)
      pendingFocus.current = blocksRef.current[at - 1]?.id ?? null
      commit(blocksRef.current.filter((b) => b.id !== id))
    },
    focus: (key) => {
      pendingFocus.current = key
    },
    addImages: (files, afterId) => void addImages(files, afterId),
  }

  const move = (id: string, step: number) => {
    const at = indexOf(id)
    const next = [...blocksRef.current]
    const [block] = next.splice(at, 1)
    next.splice(at + step, 0, block)
    commit(next)
  }

  // a text block can become another kind without retyping it
  const turnInto = (block: DocBlock, type: BlockType, level = 2) => {
    const text = block.items.length > 0 ? block.items.join(' ') : block.text
    const asList = type === 'bullets' || type === 'numbers'
    actions.patch(block.id, { type, level, text: asList ? '' : text, items: asList ? (block.items.length > 0 ? block.items : [text]) : [] })
  }

  const menuFor = (block: DocBlock, index: number): ActionMenuItem[] => {
    const convertible = ['paragraph', 'heading', 'bullets', 'numbers', 'quote'].includes(block.type)
    return [
      ...(convertible
        ? [
            { key: 'p', label: t('docs.block.paragraph'), onSelect: () => turnInto(block, 'paragraph') },
            { key: 'h2', label: t('docs.block.h2'), onSelect: () => turnInto(block, 'heading', 2) },
            { key: 'h3', label: t('docs.block.h3'), onSelect: () => turnInto(block, 'heading', 3) },
            { key: 'ul', label: t('docs.fmt.bullets'), onSelect: () => turnInto(block, 'bullets') },
            { key: 'ol', label: t('docs.fmt.numbers'), onSelect: () => turnInto(block, 'numbers') },
            { key: 'q', label: t('docs.block.quote'), onSelect: () => turnInto(block, 'quote') },
          ]
        : []),
      { key: 'up', label: t('docs.block.up'), disabled: index === 0, dividerBefore: convertible, onSelect: () => move(block.id, -1) },
      { key: 'down', label: t('docs.block.down'), disabled: index === blocks.length - 1, onSelect: () => move(block.id, 1) },
      { key: 'del', label: t('common.delete'), tone: 'danger', dividerBefore: true, onSelect: () => actions.remove(block.id) },
    ]
  }

  return (
    <div className="space-y-2">
      <InlineToolbar t={t} />
      <div
        ref={rootRef}
        className="max-h-[46vh] min-h-[18rem] space-y-1 overflow-y-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-2 text-[0.875rem] leading-relaxed"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const id = (e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')?.dataset.blockId
          void addImages(imageFilesOf(e.dataTransfer.files), id)
        }}
      >
        {blocks.map((block, index) => (
          <div key={block.id} data-block-id={block.id} className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <BlockView block={block} actions={actions} t={t} />
            </div>
            <ActionMenu label={t('docs.block.menu')} items={menuFor(block, index)} compact />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ImagePickButton label={t('docs.fmt.image')} busy={uploading} onFiles={(f) => void addImages(f)} />
        {ADD.map(({ type, Icon, key }) => (
          <Button
            key={type}
            size="sm"
            variant="ghost"
            icon={<Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
            onClick={() => {
              const block = makeBlock(type)
              pendingFocus.current = block.id
              insertAt(blocksRef.current.length, [block])
            }}
          >
            {t(key)}
          </Button>
        ))}
      </div>
    </div>
  )
}

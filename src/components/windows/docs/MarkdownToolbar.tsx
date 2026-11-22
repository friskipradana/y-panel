import { useRef, useState, type RefObject } from 'react'
import { Bold, Code, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react'
import { toast } from 'sonner'
import { uploadDocImage } from '@/api/docs'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'

type Format = 'h2' | 'bold' | 'italic' | 'link' | 'ul' | 'ol' | 'quote' | 'code'

// Wraps or prefixes the selected text and returns the new value with the caret range to restore
function applyFormat(value: string, start: number, end: number, format: Format) {
  const selected = value.slice(start, end)
  const wrap = (before: string, after: string, placeholder: string) => {
    const body = selected || placeholder
    return {
      text: value.slice(0, start) + before + body + after + value.slice(end),
      from: start + before.length,
      to: start + before.length + body.length,
    }
  }
  const prefixLines = (make: (index: number) => string, placeholder: string) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const block = value.slice(lineStart, end) || placeholder
    const next = block
      .split('\n')
      .map((line, i) => make(i) + line)
      .join('\n')
    return { text: value.slice(0, lineStart) + next + value.slice(end), from: lineStart, to: lineStart + next.length }
  }
  switch (format) {
    case 'bold':
      return wrap('**', '**', 'bold')
    case 'italic':
      return wrap('*', '*', 'italic')
    case 'code':
      return selected.includes('\n') ? wrap('```\n', '\n```', 'code') : wrap('`', '`', 'code')
    case 'link': {
      const label = selected || 'link'
      const text = `${value.slice(0, start)}[${label}](https://)${value.slice(end)}`
      const from = start + label.length + 3
      return { text, from, to: from + 8 }
    }
    case 'h2':
      return prefixLines(() => '## ', 'Heading')
    case 'ul':
      return prefixLines(() => '- ', 'item')
    case 'ol':
      return prefixLines((i) => `${i + 1}. `, 'item')
    default:
      return prefixLines(() => '> ', 'quote')
  }
}

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
}

// Formatting buttons and image upload for the article editor. A chosen image is uploaded to the
// panel and inserted at the caret as markdown.
export function MarkdownToolbar({ textareaRef, value, onChange }: Props) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const commit = (text: string, from: number, to: number) => {
    onChange(text)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(from, to)
    })
  }

  const format = (kind: Format) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const r = applyFormat(value, start, end, kind)
    commit(r.text, r.from, r.to)
  }

  const insertImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setUploading(true)
    try {
      let text = value
      let caret = textareaRef.current?.selectionStart ?? text.length
      for (const file of images) {
        const { url } = await uploadDocImage(file)
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')
        const snippet = `\n\n![${alt}](${url})\n\n`
        text = text.slice(0, caret) + snippet + text.slice(caret)
        caret += snippet.length
      }
      commit(text, caret, caret)
    } catch {
      toast.error(t('docs.imageFailed'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('docs.toolbar')}>
      <IconButton label={t('docs.fmt.heading')} onClick={() => format('h2')}><Heading2 className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.bold')} onClick={() => format('bold')}><Bold className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.italic')} onClick={() => format('italic')}><Italic className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.link')} onClick={() => format('link')}><Link2 className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.bullets')} onClick={() => format('ul')}><List className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.numbers')} onClick={() => format('ol')}><ListOrdered className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.quote')} onClick={() => format('quote')}><Quote className="h-4 w-4" /></IconButton>
      <IconButton label={t('docs.fmt.code')} onClick={() => format('code')}><Code className="h-4 w-4" /></IconButton>
      <IconButton
        label={uploading ? t('docs.imageUploading') : t('docs.fmt.image')}
        tone="primary"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus className="h-4 w-4" />
      </IconButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void insertImages(Array.from(e.target.files ?? []))}
      />
    </div>
  )
}

import { useRef, useState } from 'react'
import { Bold, Check, Code, Italic, Link2 } from 'lucide-react'
import { TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'

// The selection inside a line of the editor, if there is one
function editorRange(): { range: Range; host: HTMLElement } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const node = range.commonAncestorContainer
  const host = (node instanceof HTMLElement ? node : node.parentElement)?.closest<HTMLElement>('[contenteditable="true"]')
  return host ? { range, host } : null
}

// Bold, italic, code and link for the selected words
export function InlineToolbar({ t }: { t: (key: string) => string }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [href, setHref] = useState('https://')
  const saved = useRef<{ range: Range; host: HTMLElement } | null>(null)

  const command = (name: 'bold' | 'italic') => {
    if (editorRange()) document.execCommand(name)
  }

  const asCode = () => {
    const found = editorRange()
    if (!found || found.range.collapsed) return
    const code = document.createElement('code')
    code.textContent = found.range.toString()
    found.range.deleteContents()
    found.range.insertNode(code)
    found.host.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const applyLink = () => {
    const target = saved.current
    setLinkOpen(false)
    if (!target || !/^(https?:\/\/|mailto:)\S+$/i.test(href.trim())) return
    target.host.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(target.range)
    document.execCommand('createLink', false, href.trim())
  }

  return (
    // keeping the mouse from taking focus keeps the words selected
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('docs.toolbar')}>
      <IconButton label={t('docs.fmt.bold')} onMouseDown={(e) => e.preventDefault()} onClick={() => command('bold')}>
        <Bold className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton label={t('docs.fmt.italic')} onMouseDown={(e) => e.preventDefault()} onClick={() => command('italic')}>
        <Italic className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton label={t('docs.fmt.code')} onMouseDown={(e) => e.preventDefault()} onClick={asCode}>
        <Code className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={t('docs.fmt.link')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const found = editorRange()
          if (!found || found.range.collapsed) return
          saved.current = { range: found.range.cloneRange(), host: found.host }
          setHref('https://')
          setLinkOpen(true)
        }}
      >
        <Link2 className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>
      {linkOpen ? (
        <div className="flex min-w-[14rem] flex-1 items-center gap-1">
          <TextInput
            mono
            autoFocus
            value={href}
            aria-label={t('docs.fmt.link')}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setLinkOpen(false)
              }
            }}
          />
          <IconButton label={t('docs.block.applyLink')} onClick={applyLink}>
            <Check className="h-4 w-4" strokeWidth={1.75} />
          </IconButton>
        </div>
      ) : null}
    </div>
  )
}

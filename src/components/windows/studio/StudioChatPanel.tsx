import { useEffect, useRef, useState } from 'react'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import type { AIImageRef, StudioElementRef, StudioPage } from '@/api/studio'
import { ImageChips, ImagePickButton } from '@/components/common/ImageAttach'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { imageFilesOf, useImageAttachments } from '@/hooks/useImageAttachments'
import type { ElementEdit, PickedElement } from './previewBridge'
import { StudioElementEditor } from './StudioElementEditor'

export interface ChatSend {
  message: string
  images?: AIImageRef[]
  element?: StudioElementRef
}

// Seconds the current request has been running: the honest progress there is, the model gives no steps
function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="panel-mono">{seconds}s</span>
}

export function StudioChatPanel({
  page,
  pending,
  busy,
  picked,
  onElementEdit,
  onClearPicked,
  onSend,
  t,
}: {
  page: StudioPage
  /** the instruction on its way, shown before the answer arrives */
  pending: string | null
  busy: boolean
  picked: PickedElement | null
  onElementEdit: (edit: ElementEdit) => void
  onClearPicked: () => void
  onSend: (send: ChatSend, done: () => void) => void
  t: (key: string) => string
}) {
  const [prompt, setPrompt] = useState('')
  const [dragging, setDragging] = useState(false)
  const attach = useImageAttachments()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [page.chatHistory.length, busy])

  const send = (text?: string) => {
    const message = (text ?? prompt).trim() || (attach.images.length > 0 ? t('studio.builder.placeImages') : '')
    if (!message || busy || attach.uploading) return
    onSend(
      {
        message,
        images: attach.images.length > 0 ? attach.images : undefined,
        element: picked ? { selector: picked.selector, html: picked.html } : undefined,
      },
      () => {
        setPrompt('')
        attach.clear()
        onClearPicked()
      },
    )
  }

  const quickPrompts = page.kind === 'docs'
    ? [t('studio.quickDoc1'), t('studio.quickDoc2'), t('studio.quickDoc3')]
    : [t('studio.quickLand1'), t('studio.quickLand2'), t('studio.quickLand3'), t('studio.quickLand4')]

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void attach.add(imageFilesOf(e.dataTransfer.files))
      }}
    >
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {page.chatHistory.length === 0 && !pending ? (
          <div className="rounded-lg border border-dashed border-[var(--win-border)] p-3 text-xs text-[var(--text-secondary)]">
            {t('studio.builder.chatEmpty')}
          </div>
        ) : null}
        {page.chatHistory.map((m, idx) => (
          <div
            key={idx}
            className={`space-y-1.5 rounded-lg px-3 py-2 text-xs leading-relaxed ${
              m.role === 'user'
                ? 'ml-6 border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]'
                : 'mr-4 border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)]'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
            {m.images?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {m.images.map((url) => (
                  <img key={url} src={url} alt="" loading="lazy" className="h-10 w-10 rounded-md border border-[var(--win-border)] object-cover" />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {pending ? (
          <>
            <div className="ml-6 whitespace-pre-wrap break-words rounded-lg border border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)] px-3 py-2 text-xs text-[var(--panel-primary-text)]">
              {pending}
            </div>
            <div className="mr-4 flex items-center gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-xs text-[var(--text-secondary)]" role="status">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
              <span>{t('studio.aiApplyingChanges')}</span>
              <Elapsed />
            </div>
          </>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className={`space-y-2 border-t p-3 ${dragging ? 'border-[var(--panel-primary-border)] bg-[var(--panel-primary-bg)]' : 'border-[var(--win-border)]'}`}>
        {picked ? (
          <StudioElementEditor key={picked.selector} element={picked} onEdit={onElementEdit} onClose={onClearPicked} t={t} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((qp) => (
              <Button key={qp} size="sm" variant="ghost" disabled={busy} onClick={() => send(qp)}>
                {qp}
              </Button>
            ))}
          </div>
        )}
        <ImageChips attach={attach} />
        <Textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={picked ? t('studio.pick.chatPh') : t('studio.builder.chatPh')}
          onPaste={(e) => {
            const files = imageFilesOf(e.clipboardData.files)
            if (files.length === 0) return
            e.preventDefault()
            void attach.add(files)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <ImagePickButton label={t('attach.add')} busy={attach.uploading} disabled={busy} onFiles={(f) => void attach.add(f)} />
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            disabled={attach.uploading || (!prompt.trim() && attach.images.length === 0)}
            icon={<ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />}
            onClick={() => send()}
          >
            {t('studio.builder.sendPrompt')}
          </Button>
        </div>
      </div>
    </div>
  )
}

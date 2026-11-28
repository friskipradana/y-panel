import { useEffect, useMemo, useRef } from 'react'
import { BookOpen, LoaderCircle, MousePointerClick } from 'lucide-react'
import type { StudioPage } from '@/api/studio'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Markdown } from '@/lib/markdown'
import { PublicLandingView } from '@/pages/studio/PublicLandingView'
import { MODE_MESSAGE, PICK_MESSAGE, withBridge, type PickedElement } from './previewBridge'

export type PreviewViewport = 'desktop' | 'tablet' | 'mobile'

const FRAME_WIDTH: Record<PreviewViewport, string> = {
  desktop: 'w-full',
  tablet: 'w-full max-w-[768px]',
  mobile: 'w-full max-w-[390px]',
}

// Live preview frame inside Page Studio Lovable workspace; in pick mode a click reports the element instead of using the page
export function StudioLivePreview({
  page,
  viewport,
  busy,
  picking,
  onPickingChange,
  onPick,
  t,
}: {
  page: StudioPage
  viewport: PreviewViewport
  busy?: boolean
  picking: boolean
  onPickingChange: (on: boolean) => void
  onPick: (element: PickedElement) => void
  t: (key: string) => string
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const html = page.kind === 'landing' ? (page.htmlCode?.trim() ?? '') : ''
  const srcDoc = useMemo(() => (html ? withBridge(html) : ''), [html])

  const sendMode = () => frameRef.current?.contentWindow?.postMessage({ type: MODE_MESSAGE, on: picking }, '*')
  useEffect(sendMode, [picking, srcDoc])

  useEffect(() => {
    // only the preview frame itself is listened to
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || e.data?.type !== PICK_MESSAGE) return
      if (e.data.ready) sendMode()
      else if (picking && e.data.element) onPick(e.data.element as PickedElement)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  })

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--panel-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
        <span className="panel-mono truncate">/p/{page.slug}</span>
        <div className="flex shrink-0 items-center gap-2">
          {html ? (
            <Button
              size="sm"
              variant={picking ? 'primary-soft' : 'outline'}
              aria-pressed={picking}
              icon={<MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => onPickingChange(!picking)}
            >
              {picking ? t('studio.pick.stop') : t('studio.pick.start')}
            </Button>
          ) : null}
          {page.kind === 'docs' && page.showInDocs ? (
            <Badge tone="info" size="sm">{t('studio.syncedDocsBadge')}</Badge>
          ) : (
            <Badge tone={page.status === 'published' ? 'success' : 'neutral'} size="sm">
              {page.status === 'published' ? t('studio.status.published') : t('studio.status.draft')}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-y-auto p-3 sm:p-4">
        <div
          className={`mx-auto flex min-h-full flex-col overflow-hidden rounded-xl border bg-[var(--win-content-bg)] transition-[max-width] duration-200 ${picking ? 'border-[var(--panel-primary-border)]' : 'border-[var(--win-border)]'} ${FRAME_WIDTH[viewport]}`}
        >
          {html ? (
            <iframe
              ref={frameRef}
              title={page.title || page.slug}
              srcDoc={srcDoc}
              onLoad={sendMode}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
              className="min-h-[520px] w-full flex-1 border-0 bg-[var(--win-content-bg)]"
            />
          ) : page.kind === 'landing' ? (
            <PublicLandingView page={page} t={t} embedded />
          ) : (
            <article className="mx-auto max-w-3xl p-5 sm:p-8">
              <header className="space-y-2 border-b border-[var(--win-border)] pb-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <BookOpen className="h-3.5 w-3.5 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
                  <span>{page.brandName || t('studio.kind.docs')}</span>
                  <span className="panel-mono">/p/{page.slug}</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--win-text)]">
                  {page.title || t('studio.defaultDocTitle')}
                </h1>
                {page.subtitle ? (
                  <p className="text-sm text-[var(--text-secondary)]">{page.subtitle}</p>
                ) : null}
              </header>
              <Markdown source={page.markdownBody || ''} className="mt-5" />
            </article>
          )}
        </div>
      </div>

      {busy ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--panel-primary-border)] bg-[var(--win-bar)] px-3 py-1.5 text-xs font-medium text-[var(--panel-primary-text)]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            <span>{t('studio.aiApplyingChanges')}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

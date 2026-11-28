import { useMemo, useRef } from 'react'
import { ArrowLeft, Calendar, Link2, PenSquare, Trash2 } from 'lucide-react'
import type { DocRecord } from '@/api/agent'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDateID } from '@/lib/datetime'
import { Markdown } from '@/lib/markdown'
import { docKind, headingsOf, visibility } from './docMeta'
import type { DocsWindowState } from './useDocsWindow'

// Reading view: a readable column, with the table of contents of longer posts on top
export function DocViewer({ dw, doc }: { dw: DocsWindowState; doc: DocRecord }) {
  const { t, isAdmin, openEdit, confirmDelete, copyLink, setSelectedId, features } = dw
  const shared = doc.isPublic && doc.status === 'published'
  const official = doc.source === 'official'
  const vis = visibility(doc)
  const kind = docKind(doc)
  const bodyRef = useRef<HTMLDivElement>(null)
  const headings = useMemo(() => headingsOf(doc.content), [doc.content])
  const feature = features.find((f) => f.key === doc.featureKey)

  // headings are rendered in the same order they are listed
  const goTo = (index: number) => bodyRef.current?.querySelectorAll('h2, h3, h4, h5')[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <article className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 @3xl:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 @3xl:hidden">
          <Button variant="ghost" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('docs.back')}
          </Button>
        </div>
        <header className="space-y-3 border-b border-[var(--win-border)] pb-4">
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
            <Badge tone={kind === 'doc' ? 'info' : 'neutral'}>{t(`docs.kind.${kind}`)}</Badge>
            <Badge tone={official ? 'primary' : doc.status === 'published' ? 'success' : doc.status === 'draft' ? 'warning' : 'neutral'}>{t(`docs.visibility.${vis}`)}</Badge>
            {feature ? <Badge tone="neutral">{feature.name}</Badge> : null}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateID(doc.updatedAt)}
            </span>
          </div>
          <h2 className="text-xl font-bold leading-snug tracking-tight">{doc.title}</h2>
          {doc.excerpt ? <p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{doc.excerpt}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {shared || official ? (
              <Button variant="ghost" onClick={() => void copyLink(doc)}>
                <Link2 className="h-3.5 w-3.5" />
                {t('docs.copyPublicLink')}
              </Button>
            ) : null}
            {isAdmin && !official ? (
              <>
                <Button variant="outline" onClick={() => openEdit(doc)}>
                  <PenSquare className="h-3.5 w-3.5" />
                  {t('common.edit')}
                </Button>
                <Button variant="danger-soft" onClick={() => void confirmDelete(doc)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('common.delete')}
                </Button>
              </>
            ) : null}
          </div>
        </header>
        {headings.length > 2 ? (
          <nav aria-label={t('docs.toc')} className="mt-4 rounded-xl border border-[var(--win-border)] p-3">
            <div className="panel-section-label mb-1.5">{t('docs.toc')}</div>
            <ul className="space-y-0.5">
              {headings.map((h, i) => (
                <li key={`${h.text}-${i}`} className={h.level > 2 ? 'pl-3' : ''}>
                  <button
                    type="button"
                    className="rounded text-left text-[0.8125rem] text-[var(--panel-primary-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                    onClick={() => goTo(i)}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div ref={bodyRef}>
          <Markdown source={doc.content} className="mt-5" />
        </div>
      </div>
    </article>
  )
}

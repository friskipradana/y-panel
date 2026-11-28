import { Fragment, type ReactNode } from 'react'

// Small markdown renderer for docs and release notes. It builds React elements
// (never HTML strings), so article content cannot inject markup or scripts, and
// only http(s) and mailto links are rendered as links. Images are limited to the article image
// store of the panel, https URLs, and the img/ folder of the official docs in the repository.

const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const OFFICIAL_IMAGE_BASE = 'https://raw.githubusercontent.com/friskipradana/y-panel/HEAD/docs/articles/img/'

// Returns a loadable src, or null when the address is not allowed
export function resolveImageSrc(raw: string): string | null {
  if (/^\/api\/v1\/public\/doc-images\/[a-f0-9]{40}\.(png|jpg|gif|webp)$/.test(raw)) return raw
  if (/^https:\/\//i.test(raw)) return raw
  const relative = /^(?:\.\/)?img\/([\w.-]+\.(?:png|jpe?g|gif|webp))$/i.exec(raw)
  return relative ? OFFICIAL_IMAGE_BASE + relative[1] : null
}

const INLINE = /(!\[[^\]\n]*\]\([^)\s]+\)|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<>)\]]+)/g

function renderInline(text: string, keyPrefix: string, allowLinks = true): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('![')) {
      const close = token.indexOf('](')
      const alt = token.slice(2, close)
      const src = resolveImageSrc(token.slice(close + 2, -1))
      out.push(
        src ? (
          <img
            key={key}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="my-2 block h-auto max-w-full rounded-xl border border-[var(--win-border)]"
          />
        ) : (
          <Fragment key={key}>{alt}</Fragment>
        ),
      )
    } else if (token.startsWith('`')) {
      out.push(
        <code key={key} className="panel-mono rounded bg-[var(--panel-surface-strong)] px-1 py-0.5 text-[0.85em] text-[var(--win-text)]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={key} className="font-semibold text-[var(--win-text)]">{renderInline(token.slice(2, -2), key, allowLinks)}</strong>)
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      const label = token.slice(1, close)
      const href = token.slice(close + 2, -1)
      out.push(
        allowLinks && SAFE_LINK.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-[var(--panel-primary-text)] underline underline-offset-2 break-all">
            {renderInline(label, key, false)}
          </a>
        ) : (
          <Fragment key={key}>{renderInline(label, key, false)}</Fragment>
        ),
      )
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      const cleanHref = token.replace(/[.,;:!?]+$/, '')
      const trailing = token.slice(cleanHref.length)
      out.push(
        allowLinks && SAFE_LINK.test(cleanHref) ? (
          <Fragment key={key}>
            <a href={cleanHref} target="_blank" rel="noreferrer noopener" className="text-[var(--panel-primary-text)] underline underline-offset-2 break-all">
              {cleanHref}
            </a>
            {trailing}
          </Fragment>
        ) : (
          <Fragment key={key}>{token}</Fragment>
        ),
      )
    } else {
      out.push(<em key={key}>{renderInline(token.slice(1, -1), key, allowLinks)}</em>)
    }
    last = start + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'rule' }

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: body.join(' ') })
      continue
    }
    const bullet = /^\s*[-*+]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const matcher = ordered ? numbered : bullet
      const items: string[] = []
      while (i < lines.length && matcher.test(lines[i])) items.push(lines[i++].replace(matcher, ''))
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const body: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,})\s*$/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i])
    ) {
      body.push(lines[i++].trim())
    }
    blocks.push({ type: 'paragraph', text: body.join(' ') })
  }
  return blocks
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-6 text-xl font-bold tracking-tight',
  2: 'mt-6 text-lg font-bold tracking-tight',
  3: 'mt-5 text-[0.9375rem] font-semibold',
  4: 'mt-4 text-[0.875rem] font-semibold',
}

const COMPACT_HEADING_CLASS: Record<number, string> = {
  1: 'mt-2 first:mt-0 text-[0.875rem] font-semibold text-[var(--win-text)]',
  2: 'mt-2 first:mt-0 text-[0.8125rem] font-semibold text-[var(--win-text)]',
  3: 'mt-1.5 first:mt-0 text-[0.75rem] font-semibold text-[var(--win-text)]',
  4: 'mt-1.5 first:mt-0 text-[0.75rem] font-medium text-[var(--win-text)]',
}

export function Markdown({
  source,
  className = '',
  compact = false,
}: {
  source: string
  className?: string
  compact?: boolean
}) {
  const blocks = parseBlocks(source)
  const headingMap = compact ? COMPACT_HEADING_CLASS : HEADING_CLASS
  const rootClass = compact
    ? `space-y-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)] break-words ${className}`.trim()
    : `space-y-3 text-[0.875rem] leading-relaxed text-[var(--win-text)] ${className}`.trim()

  return (
    <div className={rootClass}>
      {blocks.map((block, index) => {
        const key = `b${index}`
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2'
            return (
              <Tag key={key} className={headingMap[block.level]}>
                {renderInline(block.text, key)}
              </Tag>
            )
          }
          case 'code':
            return (
              <pre
                key={key}
                className={
                  compact
                    ? 'panel-mono overflow-x-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-2 text-[0.75rem] leading-relaxed text-[var(--win-text)]'
                    : 'panel-mono overflow-x-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-3 text-[0.8125rem] leading-relaxed'
                }
              >
                {block.text}
              </pre>
            )
          case 'quote':
            return (
              <blockquote key={key} className="border-l-2 border-[var(--win-border)] pl-3 text-[var(--text-secondary)]">
                {renderInline(block.text, key)}
              </blockquote>
            )
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return (
              <Tag
                key={key}
                className={`${compact ? 'space-y-0.5 pl-4' : 'space-y-1 pl-5'} ${block.ordered ? 'list-decimal' : 'list-disc'}`}
              >
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`)}</li>
                ))}
              </Tag>
            )
          }
          case 'rule':
            return <hr key={key} className="border-[var(--win-border)]" />
          default: {
            // a picture alone in its paragraph is a figure, with its description as the caption
            const alone = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(block.text)
            const src = alone ? resolveImageSrc(alone[2]) : null
            if (alone && src && !compact) {
              return (
                <figure key={key} className="my-5 space-y-2">
                  <img src={src} alt={alone[1]} loading="lazy" decoding="async" className="mx-auto block h-auto max-w-full rounded-xl border border-[var(--win-border)]" />
                  {alone[1] ? <figcaption className="text-center text-[0.75rem] text-[var(--text-secondary)]">{alone[1]}</figcaption> : null}
                </figure>
              )
            }
            return <p key={key}>{renderInline(block.text, key)}</p>
          }
        }
      })}
    </div>
  )
}

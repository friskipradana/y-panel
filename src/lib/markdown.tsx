import { Fragment, type ReactNode } from 'react'

// Small markdown renderer for docs and release notes. It builds React elements
// (never HTML strings), so article content cannot inject markup or scripts, and
// only http(s) and mailto links are rendered as links.

const SAFE_LINK = /^(https?:\/\/|mailto:)/i
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('`')) {
      out.push(
        <code key={key} className="panel-mono rounded bg-[var(--panel-surface-strong)] px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>)
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      const label = token.slice(1, close)
      const href = token.slice(close + 2, -1)
      out.push(
        SAFE_LINK.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="text-[var(--panel-primary-text)] underline underline-offset-2">
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        ),
      )
    } else {
      out.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>)
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

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = parseBlocks(source)
  return (
    <div className={`space-y-3 text-[0.875rem] leading-relaxed text-[var(--win-text)] ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `b${index}`
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2'
            return (
              <Tag key={key} className={HEADING_CLASS[block.level]}>
                {renderInline(block.text, key)}
              </Tag>
            )
          }
          case 'code':
            return (
              <pre key={key} className="panel-mono overflow-x-auto rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-3 text-[0.8125rem] leading-relaxed">
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
              <Tag key={key} className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`)}</li>
                ))}
              </Tag>
            )
          }
          case 'rule':
            return <hr key={key} className="border-[var(--win-border)]" />
          default:
            return <p key={key}>{renderInline(block.text, key)}</p>
        }
      })}
    </div>
  )
}

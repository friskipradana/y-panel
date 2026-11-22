import { Fragment, type ReactNode } from 'react'

// Dialog text may carry names typed by users or messages from the server. It is
// rendered as text; only bold, line breaks and paragraphs are understood, never HTML.
const TOKEN = /(<\/?(?:b|strong)>|\n)/gi
const BREAK = /<br\s*\/?>/gi

function renderParagraph(source: string, keyPrefix: string): ReactNode[] {
  const parts = source.split(TOKEN)
  const nodes: ReactNode[] = []
  let bold = false
  let key = 0
  for (const part of parts) {
    const tag = part.toLowerCase()
    if (tag === '<b>' || tag === '<strong>') {
      bold = true
    } else if (tag === '</b>' || tag === '</strong>') {
      bold = false
    } else if (tag === '\n') {
      nodes.push(<br key={`${keyPrefix}b${key++}`} />)
    } else if (part) {
      nodes.push(bold ? <strong key={`${keyPrefix}s${key++}`}>{part}</strong> : <Fragment key={`${keyPrefix}t${key++}`}>{part}</Fragment>)
    }
  }
  return nodes
}

// A blank line starts a new paragraph (spaced by the container); a single line break stays a break.
export function renderAlertText(source: string): ReactNode {
  const text = String(source ?? '').replace(BREAK, '\n').replace(/\r\n/g, '\n')
  const paragraphs = text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  return paragraphs.map((p, i) => <p key={`p${i}`}>{renderParagraph(p, `p${i}`)}</p>)
}

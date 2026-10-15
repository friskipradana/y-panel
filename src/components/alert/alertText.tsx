import { Fragment, type ReactNode } from 'react'

// Dialog text may carry names typed by users or messages from the server. It is
// rendered as text; only bold and line breaks are understood, never HTML.
const TOKEN = /(<\/?(?:b|strong)>|<br\s*\/?>|\n)/gi

export function renderAlertText(source: string): ReactNode {
  const parts = String(source ?? '').split(TOKEN)
  const nodes: ReactNode[] = []
  let bold = false
  let key = 0
  for (const part of parts) {
    const tag = part.toLowerCase()
    if (tag === '<b>' || tag === '<strong>') {
      bold = true
    } else if (tag === '</b>' || tag === '</strong>') {
      bold = false
    } else if (tag === '\n' || tag.startsWith('<br')) {
      nodes.push(<br key={`b${key++}`} />)
    } else if (part) {
      nodes.push(bold ? <strong key={`s${key++}`}>{part}</strong> : <Fragment key={`t${key++}`}>{part}</Fragment>)
    }
  }
  return nodes
}

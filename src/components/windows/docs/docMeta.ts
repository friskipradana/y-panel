import type { DocRecord } from '@/api/agent'

// what a reader sees: the pill of each, in the classes the list windows share
export function visibility(doc: DocRecord): string {
  if (doc.source === 'official') return 'official'
  if (doc.status !== 'published') return doc.status
  return doc.isPublic ? 'public' : 'private'
}

export function docKind(doc: DocRecord): 'doc' | 'article' {
  return doc.kind === 'doc' || doc.source === 'official' ? 'doc' : 'article'
}

export const PILL: Record<string, string> = { official: 'running', public: 'running', private: 'exited', draft: 'paused', archived: 'exited' }

// Headings outside code blocks, with the formatting marks removed
export function headingsOf(markdown: string): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = []
  let inCode = false
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    const m = !inCode && /^(#{1,4})\s+(.*)$/.exec(line)
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, '').trim() })
  }
  return out
}

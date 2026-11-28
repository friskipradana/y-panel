// The visual editor works on blocks but articles stay Markdown: parse into blocks, write blocks back.
// Anything the editor has no control for (tables, nested lists) is kept as it was written in a raw block.

export type BlockType = 'paragraph' | 'heading' | 'bullets' | 'numbers' | 'quote' | 'code' | 'image' | 'divider' | 'raw'

export interface DocBlock {
  id: string
  type: BlockType
  /** paragraph, heading, quote, code, raw; the caption of an image */
  text: string
  items: string[]
  level: number
  lang: string
  url: string
}

let nextId = 0

export function makeBlock(type: BlockType, patch: Partial<DocBlock> = {}): DocBlock {
  nextId += 1
  const items = type === 'bullets' || type === 'numbers' ? [''] : []
  return { id: `b${nextId}`, type, text: '', items, level: 2, lang: '', url: '', ...patch }
}

const FENCE = /^```(.*)$/
const HEADING = /^(#{1,4})\s+(.*)$/
const DIVIDER = /^(-{3,}|\*{3,})\s*$/
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/
const BULLET = /^[-*+]\s+/
const NUMBER = /^\d+[.)]\s+/
const QUOTE = /^>\s?/
const OTHER = /^(\s+\S|\||<)/

const startsBlock = (line: string) =>
  [FENCE, HEADING, DIVIDER, IMAGE, BULLET, NUMBER, QUOTE, OTHER].some((re) => re.test(line))

export function parseMarkdown(source: string): DocBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: DocBlock[] = []
  let i = 0
  const takeWhile = (test: (line: string) => boolean) => {
    const out: string[] = []
    while (i < lines.length && test(lines[i])) out.push(lines[i++])
    return out
  }
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      i++
      const body = takeWhile((l) => !l.startsWith('```'))
      i++
      blocks.push(makeBlock('code', { lang: fence[1].trim(), text: body.join('\n') }))
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      i++
      blocks.push(makeBlock('heading', { level: heading[1].length, text: heading[2].trim() }))
      continue
    }
    if (DIVIDER.test(line)) {
      i++
      blocks.push(makeBlock('divider'))
      continue
    }
    const image = IMAGE.exec(line)
    if (image) {
      i++
      blocks.push(makeBlock('image', { text: image[1], url: image[2] }))
      continue
    }
    if (QUOTE.test(line)) {
      const body = takeWhile((l) => QUOTE.test(l)).map((l) => l.replace(QUOTE, ''))
      blocks.push(makeBlock('quote', { text: body.join('\n') }))
      continue
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const marker = NUMBER.test(line) ? NUMBER : BULLET
      const group = takeWhile((l) => l.trim() !== '' && (marker.test(l) || /^\s+/.test(l)))
      // nested or wrapped items have no control here
      if (group.some((l) => !marker.test(l))) blocks.push(makeBlock('raw', { text: group.join('\n') }))
      else blocks.push(makeBlock(marker === NUMBER ? 'numbers' : 'bullets', { items: group.map((l) => l.replace(marker, '')) }))
      continue
    }
    if (OTHER.test(line)) {
      blocks.push(makeBlock('raw', { text: takeWhile((l) => l.trim() !== '').join('\n') }))
      continue
    }
    const body = [lines[i++]]
    body.push(...takeWhile((l) => l.trim() !== '' && !startsBlock(l)))
    blocks.push(makeBlock('paragraph', { text: body.join('\n') }))
  }
  return blocks
}

export function blockToMarkdown(b: DocBlock): string {
  switch (b.type) {
    case 'heading':
      return b.text.trim() ? `${'#'.repeat(b.level)} ${b.text.trim()}` : ''
    case 'bullets':
      return b.items.filter((it) => it.trim()).map((it) => `- ${it.trim()}`).join('\n')
    case 'numbers':
      return b.items.filter((it) => it.trim()).map((it, n) => `${n + 1}. ${it.trim()}`).join('\n')
    case 'quote':
      return b.text.trim() ? b.text.split('\n').map((l) => `> ${l}`).join('\n') : ''
    case 'code':
      return `\`\`\`${b.lang}\n${b.text}\n\`\`\``
    case 'image':
      return b.url ? `![${b.text.replace(/[[\]\n]/g, '')}](${b.url})` : ''
    case 'divider':
      return '---'
    default:
      return b.text.trim() ? b.text : ''
  }
}

export const blocksToMarkdown = (blocks: DocBlock[]) => blocks.map(blockToMarkdown).filter(Boolean).join('\n\n')

// Inline formatting: Markdown to the HTML shown while editing, and back

const INLINE =
  /(`[^`\n]+`|!\[[^\]\n]*\]\([^)\s]+\)|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s<>)\]]+|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|(?<![\w])_[^_\n]+_(?![\w]))/g

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function inlineToHtml(md: string): string {
  let out = ''
  let last = 0
  for (const match of md.matchAll(INLINE)) {
    const token = match[0]
    out += escapeHtml(md.slice(last, match.index))
    last = (match.index ?? 0) + token.length
    if (token.startsWith('`')) out += `<code>${escapeHtml(token.slice(1, -1))}</code>`
    else if (token.startsWith('![') || token.startsWith('http')) out += escapeHtml(token)
    else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      out += `<a href="${escapeHtml(token.slice(close + 2, -1))}">${inlineToHtml(token.slice(1, close))}</a>`
    } else if (token.startsWith('**') || token.startsWith('__')) out += `<strong>${inlineToHtml(token.slice(2, -2))}</strong>`
    else out += `<em>${inlineToHtml(token.slice(1, -1))}</em>`
  }
  return out + escapeHtml(md.slice(last))
}

// Markers go around the words, spaces stay outside, or Markdown would not read them
function wrap(inner: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)
  return m && m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner
}

export function htmlToInline(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent ?? '').replace(/\xa0/g, ' ')
      return
    }
    if (!(child instanceof HTMLElement)) return
    const tag = child.tagName
    if (tag === 'BR') return
    if (tag === 'CODE') {
      out += wrap(child.textContent ?? '', '`')
      return
    }
    const inner = htmlToInline(child)
    const href = tag === 'A' ? (child.getAttribute('href') ?? '') : ''
    if (tag === 'STRONG' || tag === 'B') out += wrap(inner, '**')
    else if (tag === 'EM' || tag === 'I') out += wrap(inner, '*')
    else if (/^(https?:\/\/|mailto:)/i.test(href)) out += `[${inner}](${href})`
    else out += inner
  })
  return out
}

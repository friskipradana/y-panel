// Colors and styles of terminal output (ANSI SGR codes) as plain data, so a log line is drawn with React
// nodes and never as HTML. Every other escape sequence is dropped.

export interface AnsiSegment {
  text: string
  /** 0-15 take the theme's palette (class ansi-N); a string is a computed #rrggbb */
  fg?: number | string
  bg?: number | string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

type Style = Omit<AnsiSegment, 'text'>

// ESC [ ... m, also when the ESC byte was lost on the way (what is left is "[32m")
const SGR = /(?:\x1b)?\[(\d{1,3}(?:;\d{1,3})*)?m/g
// everything else that starts an escape: other CSI sequences, OSC strings, lone ESC
const OTHER = /\x1b\[[0-9;?]*[ -/]*[@-ln-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\x1b/g
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g

function xterm256(n: number): string {
  if (n < 16) return ''
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `rgb(${v}, ${v}, ${v})`
  }
  const i = n - 16
  const level = (c: number) => (c === 0 ? 0 : 55 + c * 40)
  return `rgb(${level(Math.floor(i / 36))}, ${level(Math.floor(i / 6) % 6)}, ${level(i % 6)})`
}

function applyCodes(style: Style, codes: number[]): Style {
  const next: Style = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) return {}
    else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 3) next.italic = true
    else if (c === 4) next.underline = true
    else if (c === 22) {
      next.bold = false
      next.dim = false
    } else if (c === 23) next.italic = false
    else if (c === 24) next.underline = false
    else if (c >= 30 && c <= 37) next.fg = c - 30
    else if (c >= 90 && c <= 97) next.fg = c - 90 + 8
    else if (c === 39) delete next.fg
    else if (c >= 40 && c <= 47) next.bg = c - 40
    else if (c >= 100 && c <= 107) next.bg = c - 100 + 8
    else if (c === 49) delete next.bg
    else if (c === 38 || c === 48) {
      const key = c === 38 ? 'fg' : 'bg'
      if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        const n = codes[i + 2]
        next[key] = n < 16 ? n : xterm256(n)
        i += 2
      } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        next[key] = `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`
        i += 4
      }
    }
  }
  return next
}

// A line as styled pieces of text
export function parseAnsi(line: string): AnsiSegment[] {
  const cleaned = line.replace(OTHER, (match) => (/^\x1b\[[0-9;]*m$/.test(match) ? match : ''))
  const segments: AnsiSegment[] = []
  let style: Style = {}
  let last = 0
  const push = (text: string) => {
    const visible = text.replace(CONTROL, '')
    if (visible) segments.push({ text: visible, ...style })
  }
  for (const match of cleaned.matchAll(SGR)) {
    push(cleaned.slice(last, match.index))
    style = applyCodes(style, (match[1] ?? '0').split(';').map(Number))
    last = (match.index ?? 0) + match[0].length
  }
  push(cleaned.slice(last))
  return segments
}

// The same line as plain text (for copying and downloading)
export const stripAnsi = (line: string) => parseAnsi(line).map((s) => s.text).join('')

const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z (.*)$/s

// The timestamp docker puts in front of a line (`--timestamps`), split from the message
export function splitLogTimestamp(line: string): { stamp: string; time: string; message: string } {
  const m = STAMP.exec(line)
  if (!m) return { stamp: '', time: '', message: line }
  return { stamp: `${m[1]} ${m[2]}${m[3] ?? ''}Z`, time: `${m[2]}${(m[3] ?? '').slice(0, 4)}`, message: m[4] }
}

import type { Terminal } from 'xterm'

// The text of the terminal as plain lines: the screen and what scrolled off it. A line that the terminal wrapped is joined back to
// one line, and the empty lines at the end are left out.
export function readTerminalText(xterm: Terminal, maxLines = 3000): string {
  const buffer = xterm.buffer.active
  const from = Math.max(0, buffer.length - maxLines)
  const lines: string[] = []
  for (let y = from; y < buffer.length; y++) {
    const line = buffer.getLine(y)
    if (!line) continue
    const text = line.translateToString(true)
    if (line.isWrapped && lines.length > 0) lines[lines.length - 1] += text
    else lines.push(text)
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

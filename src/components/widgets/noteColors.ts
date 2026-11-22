// Sticky note palette: every color maps to a semantic panel token (light + dark aware)
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'violet', 'plain'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

const TOKEN: Record<Exclude<NoteColor, 'plain'>, string> = {
  yellow: 'warning',
  green: 'success',
  blue: 'info',
  pink: 'danger',
  violet: 'primary',
}

export function asNoteColor(value: unknown): NoteColor {
  return NOTE_COLORS.includes(value as NoteColor) ? (value as NoteColor) : 'yellow'
}

// Solid-looking tint: semantic bg layered over the widget surface
export function noteBackground(color: NoteColor): string {
  if (color === 'plain') return 'var(--widget-bg)'
  const token = `var(--panel-${TOKEN[color]}-bg)`
  return `linear-gradient(${token}, ${token}), var(--widget-bg)`
}

export function noteSwatch(color: NoteColor): string {
  return color === 'plain' ? 'var(--text-secondary)' : `var(--panel-${TOKEN[color]}-text)`
}

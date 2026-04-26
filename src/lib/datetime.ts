export type DateTimeInput = string | number | Date | null | undefined

const INDONESIAN_DATE_TIME_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const INDONESIAN_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const RELATIVE_DOCKER_DATE_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^about an hour ago$/i, 'sekitar 1 jam lalu'],
  [/^about a minute ago$/i, 'sekitar 1 menit lalu'],
  [/^less than a second ago$/i, 'baru saja'],
  [/^less than a minute ago$/i, 'kurang dari 1 menit lalu'],
  [/^a second ago$/i, '1 detik lalu'],
  [/^a minute ago$/i, '1 menit lalu'],
  [/^an hour ago$/i, '1 jam lalu'],
  [/^(\d+) seconds? ago$/i, '$1 detik lalu'],
  [/^(\d+) minutes? ago$/i, '$1 menit lalu'],
  [/^(\d+) hours? ago$/i, '$1 jam lalu'],
  [/^(\d+) days? ago$/i, '$1 hari lalu'],
  [/^(\d+) weeks? ago$/i, '$1 minggu lalu'],
  [/^(\d+) months? ago$/i, '$1 bulan lalu'],
  [/^(\d+) years? ago$/i, '$1 tahun lalu'],
]

export function parseDateTime(value: DateTimeInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  if (typeof value === 'number') {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const trimmed = value.trim()
  if (!trimmed) return null

  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) return direct

  const normalized = trimmed
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(\s*[+-]\d{4})?\s+.*$/, '$1T$2$3')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const normalizedDate = new Date(normalized)
  return Number.isNaN(normalizedDate.getTime()) ? null : normalizedDate
}

export function formatDateTimeID(value: DateTimeInput, fallback = '-'): string {
  const date = parseDateTime(value)
  if (!date) return typeof value === 'string' && value.trim() ? value.trim() : fallback
  return INDONESIAN_DATE_TIME_FORMAT.format(date).replace(' pukul ', ', ')
}

export function formatDateID(value: DateTimeInput, fallback = '-'): string {
  const date = parseDateTime(value)
  if (!date) return typeof value === 'string' && value.trim() ? value.trim() : fallback
  return INDONESIAN_DATE_FORMAT.format(date)
}

export function formatDockerDateTimeID(value: DateTimeInput, fallback = '-'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback

    for (const [pattern, replacement] of RELATIVE_DOCKER_DATE_TRANSLATIONS) {
      if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement)
    }
  }

  return formatDateTimeID(value, fallback)
}

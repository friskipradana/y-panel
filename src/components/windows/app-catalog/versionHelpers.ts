export const FLOATING_IMAGE_TAGS = new Set([
  'latest',
  'stable',
  'main',
  'master',
  'edge',
  'nightly',
  'dev',
  'rolling',
  'next',
  'canary',
])

export function extractTagFromImageRef(ref?: string): string {
  const trimmed = (ref || '').trim()
  if (!trimmed) return 'latest'
  const noDigest = trimmed.split('@')[0]
  const lastSlash = noDigest.lastIndexOf('/')
  const lastColon = noDigest.lastIndexOf(':')
  if (lastColon > lastSlash) {
    return noDigest.substring(lastColon + 1)
  }
  return 'latest'
}

export function isFloatingTag(tag?: string): boolean {
  const clean = (tag || '').trim().toLowerCase()
  return clean === '' || FLOATING_IMAGE_TAGS.has(clean)
}

export function isConcreteSemverTag(tag?: string): boolean {
  const clean = (tag || '').trim()
  if (!clean || isFloatingTag(clean)) return false
  if (/(?:^|-)(?:alpha|beta|rc|dev|canary|nightly|snapshot|pre|amd64|arm64|armv7|386|ppc64le|s390x)/i.test(clean)) {
    return false
  }
  return /^v?\d+\.\d+(?:\.\d+)?(?:[.-][\w]+)?$/i.test(clean)
}

export function formatSingleVersionTag(tag?: string): string {
  const clean = (tag || '').trim()
  if (!clean) return ''
  if (isFloatingTag(clean)) return clean
  if (/^\d/.test(clean)) return `v${clean}`
  if (/^V\d/.test(clean)) return `v${clean.slice(1)}`
  return clean
}

export function formatVersionDisplay(tag?: string, resolvedVersion?: string): string {
  const cleanTag = (tag || '').trim()
  const cleanResolved = (resolvedVersion || '').trim()
  if (!cleanTag) {
    return cleanResolved ? formatSingleVersionTag(cleanResolved) : ''
  }
  if (isFloatingTag(cleanTag)) {
    if (cleanResolved && !isFloatingTag(cleanResolved)) {
      return `${cleanTag} (${formatSingleVersionTag(cleanResolved)})`
    }
    return cleanTag
  }
  return formatSingleVersionTag(cleanTag)
}

export function pickPreferredCatalogVersion(
  versions: string[] | undefined,
  defaultTag: string,
): string {
  if (versions && versions.length > 0) {
    const concrete = versions.find((v) => isConcreteSemverTag(v))
    if (concrete) return concrete
  }
  return defaultTag || versions?.[0] || 'latest'
}

export function orderCatalogVersionChoices(
  rawList: string[],
  parsedTag: string,
): { ordered: string[]; latestConcrete: string } {
  const concrete: string[] = []
  const other: string[] = []
  const floating: string[] = []
  const seen = new Set<string>()

  const pushUnique = (raw: string) => {
    const t = raw.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    if (isFloatingTag(t)) {
      floating.push(t)
    } else if (isConcreteSemverTag(t)) {
      concrete.push(t)
    } else {
      other.push(t)
    }
  }

  for (const v of rawList) pushUnique(v)
  if (parsedTag) pushUnique(parsedTag)

  floating.sort((a, b) => {
    if (a === 'latest' && b !== 'latest') return -1
    if (b === 'latest' && a !== 'latest') return 1
    return 0
  })

  const ordered = [...concrete, ...other, ...floating]
  return {
    ordered,
    latestConcrete: concrete[0] || '',
  }
}

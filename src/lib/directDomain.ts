// The TXT record that proves a domain is its buyer's: a name in front of the domain, and a value that holds a token
export const VERIFY_LABEL = '_reneo-verify'
export const VERIFY_PREFIX = 'reneo-verify='

// A record for an address, AAAA for an IPv6 one, and CNAME when the target is a name
export function addressRecordType(target: string): 'A' | 'AAAA' | 'CNAME' {
  if (target.includes(':')) return 'AAAA'
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(target) ? 'A' : 'CNAME'
}

// The notes of a direct domain are codes; the page puts them in words
export function directNoteText(t: (key: string, params?: Record<string, string | number>) => string, note: string): string {
  if (note === 'txt-missing') return t('hosting.custom.directNote.txtMissing')
  if (note === 'dns-missing') return t('hosting.custom.directNote.dnsMissing')
  if (note.startsWith('dns-wrong:')) return t('hosting.custom.directNote.dnsWrong', { ips: note.slice('dns-wrong:'.length).split(',').join(', ') })
  if (note.startsWith('cert-failed:')) return t('hosting.custom.directNote.certFailed', { reason: note.slice('cert-failed:'.length) })
  return note
}

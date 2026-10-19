import type { ReactNode } from 'react'

// Values that stand in for the {names} of a text in the preview; they are examples, not data of the panel
export const SAMPLE_VALUES: Record<string, string> = {
  order: '42',
  username: 'dewi',
  plan: 'Starter',
  amount: 'Rp 150.123',
  voucher: 'HEMAT10 (-Rp 15.000)',
  address: 'dewi.reneo.my.id',
  invoice: 'https://reneo.my.id/order/abc123/invoice',
  url: 'https://reneo.my.id/order/abc123',
  bank: 'BCA',
  account: '1234567890',
  holder: 'Reneo Hosting',
  deadline: '20/10/2026 10:00',
  until: '20/01/2027 10:00',
  days: '7',
  hostname: 'toko-dewi.com',
  ip: '203.0.113.9',
  ips: '3',
  count: '5',
  minutes: '10',
  time: '19/10/2026 14:30',
  browser: 'Chrome di Windows',
  by: 'admin',
  name: 'Laptop',
  level: '2',
  since: '12',
  total: '40',
  duration: '15 menit',
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g

// The text with its {names} filled with the examples; a name without an example stays as it is
export function fillSamples(text: string, extra: Record<string, string> = {}): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => extra[name] ?? SAMPLE_VALUES[name] ?? whole)
}

// <b>, <i> and <code> become real emphasis, everything else is plain text (the agent allows nothing else in a text)
export function renderNoticeMarkup(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const stack: ('b' | 'i' | 'code')[] = []
  let key = 0
  for (const part of text.split(/(<\/?(?:b|i|code)>)/i)) {
    const tag = /^<(\/?)(b|i|code)>$/i.exec(part)
    if (tag) {
      const name = tag[2].toLowerCase() as 'b' | 'i' | 'code'
      if (tag[1]) stack.pop()
      else stack.push(name)
      continue
    }
    if (!part) continue
    let node: ReactNode = part
    for (const name of [...stack].reverse()) {
      node = name === 'b' ? <strong>{node}</strong> : name === 'i' ? <em>{node}</em> : <code className="panel-mono">{node}</code>
    }
    out.push(<span key={key++}>{node}</span>)
  }
  return out
}

// The {names} a text uses that its event does not offer
export function unknownVariables(text: string, allowed: string[]): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(PLACEHOLDER)) if (!allowed.includes(m[1])) found.add(m[1])
  return [...found]
}

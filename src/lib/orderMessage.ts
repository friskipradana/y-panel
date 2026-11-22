export interface OrderVars {
  plan: string
  price: string
  period: string
}

// What a buyer typed in the request form, for the seller who takes orders by message
export interface OrderDetails {
  name: string
  email: string
  whatsapp: string
  address: string
}

const DETAIL_KEYS = ['name', 'email', 'whatsapp', 'address'] as const

// The seller's message with {plan}, {price} and {period} filled in for the plan the buyer picked
export const fillOrderMessage = (template: string, vars: OrderVars) =>
  template.replace(/\{(plan|price|period)\}/g, (_, key: keyof OrderVars) => vars[key]).replace(/ {2,}/g, ' ').trim()

// The same, with what the buyer typed. A template that does not use {name}, {email}, {whatsapp} or {address} would
// leave those out, so they follow it as lines under the message.
export function fillRequestMessage(template: string, vars: OrderVars, details: OrderDetails, labels: Record<keyof OrderDetails, string>): string {
  const uses = DETAIL_KEYS.some((key) => template.includes(`{${key}}`))
  const filled = template.replace(/\{(name|email|whatsapp|address)\}/g, (_, key: keyof OrderDetails) => details[key] || '-')
  const base = fillOrderMessage(filled, vars)
  if (uses) return base
  const lines = DETAIL_KEYS.filter((key) => details[key]).map((key) => `${labels[key]}: ${details[key]}`)
  return lines.length > 0 ? `${base}\n\n${lines.join('\n')}` : base
}

const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'])

// URLSearchParams writes a space as "+", which WhatsApp and mail clients show literally
const encodeSpaces = (query: string) => query.replace(/\+/g, '%20')

// The order link with the message already in it: WhatsApp gets ?text=, an email gets a subject and body.
// Any other web page is left as the seller wrote it.
export function buildOrderLink(orderUrl: string, message: string, subject: string): string {
  try {
    if (orderUrl.toLowerCase().startsWith('mailto:')) {
      const [base, query = ''] = orderUrl.split('?')
      const params = new URLSearchParams(query)
      if (!params.has('subject')) params.set('subject', subject)
      if (!params.has('body')) params.set('body', message)
      return `${base}?${encodeSpaces(params.toString())}`
    }
    const url = new URL(orderUrl)
    if (WHATSAPP_HOSTS.has(url.hostname) && !url.searchParams.has('text')) {
      url.searchParams.set('text', message)
      url.search = encodeSpaces(url.search)
    }
    return url.toString()
  } catch {
    return orderUrl
  }
}

export interface OrderVars {
  plan: string
  price: string
  period: string
}

// The seller's message with {plan}, {price} and {period} filled in for the plan the buyer picked
export const fillOrderMessage = (template: string, vars: OrderVars) =>
  template.replace(/\{(plan|price|period)\}/g, (_, key: keyof OrderVars) => vars[key]).replace(/ {2,}/g, ' ').trim()

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

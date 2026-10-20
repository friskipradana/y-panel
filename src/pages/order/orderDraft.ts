// What a buyer typed into the order form, kept in this browser so a reload, a closed tab or a dropped connection does not
// cost them the typing. The password and its repeat are not kept: a secret does not belong in browser storage.
export interface OrderDraft {
  slug: string
  trial: boolean
  periods: string
  username: string
  email: string
  whatsapp: string
  displayName: string
  label: string
  zoneId: string
  voucher: string
}

const KEY = 'reneo-order-draft'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function readOrderDraft(): OrderDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { savedAt?: number; draft?: Partial<OrderDraft> }
    if (!saved.draft || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    const d = saved.draft
    const text = (value: unknown) => (typeof value === 'string' ? value : '')
    return {
      slug: text(d.slug),
      trial: d.trial === true,
      periods: text(d.periods) || '1',
      username: text(d.username),
      email: text(d.email),
      whatsapp: text(d.whatsapp),
      displayName: text(d.displayName),
      label: text(d.label),
      zoneId: text(d.zoneId),
      voucher: text(d.voucher),
    }
  } catch {
    return null
  }
}

// An empty form is not worth keeping, and leaves no trace of an order the buyer never started
export function writeOrderDraft(draft: OrderDraft) {
  try {
    const started = draft.username || draft.email || draft.whatsapp || draft.displayName || draft.label || draft.voucher
    if (!started) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), draft }))
  } catch {
    // without storage the form still works; a reload just starts empty
  }
}

export function clearOrderDraft() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

export const orderDraftIsEmpty = (draft: OrderDraft | null) =>
  !draft || !(draft.username || draft.email || draft.whatsapp || draft.displayName || draft.label || draft.voucher)

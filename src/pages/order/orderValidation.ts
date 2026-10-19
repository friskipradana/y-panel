// What the agent will accept for a new account, checked while the buyer types so a mistake shows before the order is sent.
// The rules mirror internal/users (username, email, password) and internal/notify (WhatsApp number).

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type FieldProblem = 'required' | 'usernameShape' | 'emailShape' | 'passwordShort' | 'passwordMismatch' | 'whatsappShape' | 'whatsappId'

export function usernameProblem(value: string): FieldProblem | null {
  if (value === '') return 'required'
  return USERNAME_RE.test(value) ? null : 'usernameShape'
}

export function emailProblem(value: string): FieldProblem | null {
  if (value.trim() === '') return 'required'
  return EMAIL_RE.test(value.trim()) ? null : 'emailShape'
}

export function passwordProblem(value: string): FieldProblem | null {
  if (value === '') return 'required'
  return value.length >= 8 ? null : 'passwordShort'
}

// A number the way WhatsApp wants it: digits with the country code. 0812... is taken as Indonesian.
export function normalizePhone(input: string): { value: string; problem: FieldProblem | null } {
  const raw = input.trim()
  let digits = raw.replace(/\D/g, '')
  if (digits === '') return { value: '', problem: null }
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  else if (digits.startsWith('8') && !raw.startsWith('+')) digits = `62${digits}`
  if (digits.length < 9 || digits.length > 15) return { value: digits, problem: 'whatsappShape' }
  if (digits.startsWith('62') && (digits.length < 10 || digits[2] !== '8')) return { value: digits, problem: 'whatsappId' }
  return { value: digits, problem: null }
}

export function whatsappProblem(value: string, required: boolean): FieldProblem | null {
  if (value.trim() === '') return required ? 'required' : null
  return normalizePhone(value).problem
}

// Mirrors system.ValidateHostname and the nameserver rules of the agent so the
// form can explain a problem before anything is sent.

const LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^[0-9A-Fa-f:]+$/

export function isValidHostname(value: string): boolean {
  if (!value || value.length > 253) return false
  return value.split('.').every((label) => LABEL.test(label))
}

export function isIpAddress(value: string): boolean {
  const v = value.trim()
  if (IPV4.test(v)) return true
  return v.includes(':') && v.length >= 2 && v.length <= 45 && IPV6.test(v)
}

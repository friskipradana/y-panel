import { translateNow } from '@/lib/i18n'

// The agent answers in English. Messages a buyer or the seller can run into are put in the language of the page here;
// a message that is not in the table stays as the agent wrote it.
const RULES: [RegExp, string, string[]][] = [
  [/^too many (?:requests|attempts), wait a moment$/, 'server.tooMany', []],
  [/^too many orders from this address, try again later$/, 'server.tooManyOrders', []],
  [/^one trial per address a day$/, 'server.trialLimit', []],
  [/^the address service is not ready, try again later$/, 'server.addressService', []],
  [/^no domain is offered$/, 'server.noDomain', []],
  [/^plan not found$/, 'server.planNotFound', []],
  [/^order not found$/, 'server.orderNotFound', []],
  [/^this plan has no trial$/, 'server.noTrial', []],
  [/^at most (\d+) periods$/, 'server.maxPeriods', ['n']],
  [/^name is at most 60 characters$/, 'server.nameLong', []],
  [/^this name is taken$/, 'hosting.sub.taken', []],
  [/^this name is reserved$/, 'server.nameReserved', []],
  [/^this domain is not offered$/, 'server.domainNotOffered', []],
  [/^use 3 to 32 characters$/, 'server.labelLength', []],
  [/^use only lowercase letters, digits and dashes/, 'hosting.sub.labelInvalid', []],
  [/^two dashes in a row are not allowed$/, 'server.labelDashes', []],
  [/^this voucher is switched off$/, 'order.voucher.reason.disabled', []],
  [/^this voucher is not valid yet$/, 'order.voucher.reason.notStarted', []],
  [/^this voucher has expired$/, 'order.voucher.reason.expired', []],
  [/^this voucher has been used up$/, 'order.voucher.reason.usedUp', []],
  [/^this account already used this voucher$/, 'order.voucher.reason.usedByYou', []],
  [/^this voucher is not for this plan$/, 'order.voucher.reason.wrongPlan', []],
  [/^this voucher does not apply to this kind of order$/, 'order.voucher.reason.wrongKind', []],
  [/^this voucher code is not known$/, 'order.voucher.reason.unknown', []],
  [/^this voucher can no longer be used$/, 'server.voucherGone', []],
  [/^this voucher takes the whole price off: ask the seller to renew the plan$/, 'server.voucherFree', []],
  [/^a voucher with this code already exists$/, 'server.voucherExists', []],
  [/^voucher not found$/, 'server.voucherNotFound', []],
  [/^username must be 3.30 characters/, 'order.problem.usernameShape', []],
  [/^invalid email address$/, 'order.problem.emailShape', []],
  [/^password must be at least 8 characters$/, 'order.problem.passwordShort', []],
  [/^that username or email is already used/, 'order.error.accountTaken', []],
  [/^the WhatsApp number must be 9 to 15 digits/, 'order.problem.whatsappShape', []],
  [/^an Indonesian mobile number starts with 08 or 628$/, 'order.problem.whatsappId', []],
  [/^enter the domain$/, 'server.domainEnter', []],
  [/^this domain is too long$/, 'server.domainLong', []],
  [/^enter only the domain, like example\.com, without https:\/\/ or a path$/, 'server.domainOnly', []],
  [/^an IP address is not a domain$/, 'server.domainIp', []],
  [/^enter a full domain, like example\.com$/, 'server.domainFull', []],
  [/^this is not a valid domain name$/, 'server.domainInvalid', []],
  [/^use only letters, digits and hyphens$/, 'server.domainChars', []],
  [/^this domain cannot be used$/, 'server.domainCannot', []],
  [/^this domain is already in use$/, 'server.domainInUse', []],
  [/^names under (.+) are panel addresses: pick it as a subdomain$/, 'server.domainUnderOffered', ['domain']],
  [/^turn hosting mode on first$/, 'server.hostingOff', []],
  [/^a plan with this slug already exists$/, 'server.slugExists', []],
  [/^add a bank or e-wallet to pay to/, 'hosting.payment.accountRequired', []],
  [/^a way to pay is a bank or an e-wallet$/, 'server.methodKind', []],
  [/^every bank or e-wallet needs a name, a number and a holder$/, 'hosting.payment.methodIncomplete', []],
  [/^(.+) is listed twice$/, 'server.listedTwice', ['name']],
  [/^at most (\d+) banks and e-wallets can be listed$/, 'server.maxMethods', ['n']],
  [/^give the device a name of up to 80 characters$/, 'server.deviceName', []],
  [/^the limit of 20 devices is reached/, 'server.deviceLimit', []],
  [/^a device with this name already exists/, 'server.deviceExists', []],
  [/^this device is not registered/, 'server.deviceUnknown', []],
  [/^unauthorized$/, 'server.unauthorized', []],
  [/^invalid JSON(?: body)?$/, 'server.invalidJson', []],
  [/^not found$/, 'server.notFound', []],
  [/^the database is not connected$/, 'server.dbDown', []],
]

export function localizeServerMessage(message: unknown): string | undefined {
  if (typeof message !== 'string') return undefined
  for (const [rule, key, names] of RULES) {
    const match = rule.exec(message)
    if (!match) continue
    const params: Record<string, string> = {}
    names.forEach((name, index) => {
      params[name] = match[index + 1] ?? ''
    })
    return translateNow(key, params)
  }
  return undefined
}

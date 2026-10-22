import { agentApi } from './client'

export type PlanPeriod = 'monthly' | 'yearly' | 'once'

/** A percent off when a plan is bought for at least this many of its periods */
export interface DurationDiscount {
  periods: number
  percent: number
}

export type PromoAppliesTo = 'both' | 'new' | 'renew'

export interface HostingPlan {
  id: number
  slug: string
  name: string
  tagline: string
  /** Rupiah, whole numbers */
  priceAmount: number
  period: PlanPeriod
  features: string[]
  maxProjects: number
  maxTunnels: number
  maxDatabases: number
  diskQuotaMb: number
  cpuLimitPct: number
  memoryLimitMb: number
  maxSubdomains: number
  /** Domains of their own a buyer may point at the panel; 0 means none */
  maxCustomDomains: number
  /** Days of free trial; 0 offers none */
  trialDays: number
  /** An account on the plan may bring its own notification bot */
  ownNotify: boolean
  /** Longer subscriptions cost less */
  durationDiscounts: DurationDiscount[]
  /** A percent off the list price until promoEndsAt; 0 means no promo. After the date the list price applies again. */
  promoPercent: number
  promoEndsAt: string | null
  promoAppliesTo: PromoAppliesTo
  /** While the promo runs, no voucher and no long-subscription discount can be added to it */
  promoExclusive: boolean
  highlighted: boolean
  visible: boolean
  sortOrder: number
  /** Accounts on the plan */
  accounts: number
}

export type PlanInput = Omit<HostingPlan, 'id' | 'accounts'>

export const listHostingPlans = () =>
  agentApi.get<{ plans: HostingPlan[] }>('/api/v1/hosting/plans').then((r) => r.data.plans)

export const createHostingPlan = (plan: PlanInput) =>
  agentApi.post<HostingPlan>('/api/v1/hosting/plans', plan).then((r) => r.data)

export const updateHostingPlan = (id: number, plan: PlanInput) =>
  agentApi.put<HostingPlan>(`/api/v1/hosting/plans/${id}`, plan).then((r) => r.data)

export const deleteHostingPlan = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/hosting/plans/${id}`).then((r) => r.data)

export type PlanState = 'none' | 'active' | 'grace' | 'expired'

/** A trial upgrade: the account runs on this plan while its own plan waits */
export interface PlanTrial {
  plan: HostingPlan | null
  startedAt: string
  endsAt: string
}

export interface UserPlanView {
  plan: HostingPlan | null
  expiresAt: string | null
  state: PlanState
  graceEndsAt: string | null
  graceDays: number
  trial: PlanTrial | null
}

export const getUserPlan = (userId: number) =>
  agentApi.get<UserPlanView>(`/api/v1/users/${userId}/plan`).then((r) => r.data)

/** planId null takes the account off its plan; months renews or sets the length; days gives a trial of that many days */
export const setUserPlan = (userId: number, body: { planId: number | null; months?: number; days?: number }) =>
  agentApi.put<UserPlanView>(`/api/v1/users/${userId}/plan`, body).then((r) => r.data)

/** The account runs on planId for some days; its own plan gets those days back when the trial ends */
export const startPlanTrial = (userId: number, body: { planId: number; days: number }) =>
  agentApi.post<UserPlanView>(`/api/v1/users/${userId}/plan/trial`, body).then((r) => r.data)

/** Cuts a trial short; the account's own plan gets the time the trial used */
export const endPlanTrial = (userId: number) =>
  agentApi.delete<UserPlanView>(`/api/v1/users/${userId}/plan/trial`).then((r) => r.data)

type PromoKeys = 'promoPercent' | 'promoEndsAt' | 'promoAppliesTo' | 'promoExclusive'

// The promo comes only while it runs
export type PublicPlan = Omit<HostingPlan, 'accounts' | 'cpuLimitPct' | 'visible' | 'sortOrder' | PromoKeys> & Partial<Pick<HostingPlan, PromoKeys>>

export interface PublicHosting {
  enabled: boolean
  currency?: string
  orderUrl?: string
  orderMessage?: string
  /** Buyers may sign up and pay on the page */
  selfSignup?: boolean
  /** WhatsApp can carry the notices about an order, so the form asks for a number */
  whatsapp?: boolean
  /** The domains a buyer may pick a panel address under */
  domains?: { zoneId: string; name: string }[]
  plans: PublicPlan[]
}

export const getPublicHosting = () => agentApi.get<PublicHosting>('/api/v1/public/hosting').then((r) => r.data)

export type OrderKind = 'new' | 'renew' | 'trial'
export type OrderStatus = 'pending' | 'review' | 'paid' | 'expired' | 'cancelled'

export interface OrderView {
  publicId: string
  kind: OrderKind
  status: OrderStatus
  planName: string
  periods: number
  amountBase: number
  /** The price before discounts, and what each took off; amountBase is what is left */
  amountList: number
  discountPromo?: number
  discountDuration: number
  discountVoucher: number
  voucherCode?: string
  amountTotal: number
  createdAt: string
  expiresAt: string
  paidAt: string | null
  /** Only while the order waits for money */
  payment?: { methods: { id: string; kind: 'bank' | 'ewallet'; name: string; account: string; holder: string }[] }
  /** The panel address of the buyer: where they sign in once the order is paid */
  hostname?: string
  /** An upgrade paid as the price difference for the time left */
  difference?: boolean
  /** Months the order buys; 0 or missing for a plan that does not end */
  months?: number
}

export interface CreateOrderInput {
  planId: number
  kind: 'new' | 'trial'
  periods: number
  username: string
  email: string
  displayName: string
  password: string
  /** The panel address, when the plan includes one */
  subLabel?: string
  subZoneId?: string
  /** Where the notices about the order go */
  whatsapp?: string
  /** A voucher code that takes something off the price */
  voucher?: string
}

export const createPublicOrder = (input: CreateOrderInput) =>
  agentApi.post<OrderView>('/api/v1/public/hosting/orders', input).then((r) => r.data)

// The buyer saying they transferred: the seller is told once to check; the order itself does not change
export const notifyOrderTransferred = (publicId: string) =>
  agentApi.post<{ ok: boolean; status: OrderStatus }>(`/api/v1/public/hosting/orders/${publicId}/transferred`).then((r) => r.data)

export const checkPublicSubdomain = (label: string, zoneId: string) =>
  agentApi
    .get<{ available: boolean; reason: string }>('/api/v1/public/hosting/subdomain-check', { params: { label, zoneId } })
    .then((r) => r.data)

export const getPublicOrder = (publicId: string) =>
  agentApi.get<OrderView>(`/api/v1/public/hosting/orders/${publicId}`).then((r) => r.data)

export interface AdminOrder extends Omit<OrderView, 'payment'> {
  id: number
  planId: number | null
  userId: number
  username: string
  uniqueCode: number
  note: string
  notifId: number | null
}

export interface MyPlanView {
  plan: HostingPlan | null
  expiresAt?: string | null
  state: PlanState
  graceEndsAt?: string | null
  /** The account may renew by a transfer from here */
  renewable: boolean
  maxPeriods?: number
  /** A renewal that already waits for its payment */
  openOrder?: OrderView
  trial?: PlanTrial | null
  /** Plans the account may move up to, dearer per month than its own */
  upgrades?: HostingPlan[]
  /** What moving to each of them costs as a difference for the time left, by plan id; only while the plan runs */
  upgradeDifferences?: Record<string, { amount: number; days: number }>
}

export const getMyPlan = () => agentApi.get<MyPlanView>('/api/v1/me/hosting/plan').then((r) => r.data)

/** planId names a plan to move up to; without it the plan the account is on is renewed */
/** mode "difference" pays only the price difference for the time left, and the end date stays */
export const renewMyPlan = (periods: number, voucher?: string, planId?: number, mode?: 'difference') =>
  agentApi.post<OrderView>('/api/v1/me/hosting/renew', { periods, voucher: voucher || undefined, planId, mode }).then((r) => r.data)

// ── Vouchers ────────────────────────────────────────────────────────────

export type VoucherKind = 'percent' | 'fixed'
export type VoucherAppliesTo = 'both' | 'new' | 'renew'

export interface HostingVoucher {
  id: number
  code: string
  kind: VoucherKind
  /** A percent (1 to 100) or rupiah, by kind */
  value: number
  /** Orders that may use it in all; 0 means no limit */
  maxUses: number
  /** Orders one account may use it on; 0 means no limit */
  maxPerAccount: number
  appliesTo: VoucherAppliesTo
  /** Plans it is for; empty means every plan */
  planIds: number[]
  validFrom: string | null
  validUntil: string | null
  enabled: boolean
  note: string
  createdAt: string
  /** Orders that hold it now: waiting, under review or paid */
  used: number
}

export type VoucherInput = Omit<HostingVoucher, 'id' | 'createdAt' | 'used'>

export const listHostingVouchers = () => agentApi.get<HostingVoucher[]>('/api/v1/hosting/vouchers').then((r) => r.data)
export const createHostingVoucher = (voucher: VoucherInput) => agentApi.post<HostingVoucher>('/api/v1/hosting/vouchers', voucher).then((r) => r.data)
export const updateHostingVoucher = (id: number, voucher: VoucherInput) => agentApi.put<HostingVoucher>(`/api/v1/hosting/vouchers/${id}`, voucher).then((r) => r.data)
export const deleteHostingVoucher = (id: number) => agentApi.delete<{ ok: boolean }>(`/api/v1/hosting/vouchers/${id}`).then((r) => r.data)

// ── The price before ordering ───────────────────────────────────────────

export interface PriceQuote {
  list: number
  promoPercent: number
  promoDiscount: number
  promoExclusive: boolean
  durationPercent: number
  durationDiscount: number
  voucherDiscount: number
  subtotal: number
}

export type VoucherReason = 'unknown' | 'disabled' | 'notStarted' | 'expired' | 'usedUp' | 'usedByYou' | 'wrongPlan' | 'wrongKind' | 'promoExclusive'

export interface QuoteAnswer {
  quote: PriceQuote
  voucher?: { code: string; valid: boolean; reason?: VoucherReason; kind?: VoucherKind; value?: number }
}

export interface QuoteInput {
  planId: number
  periods: number
  voucher?: string
}

// A buyer who has no account yet asks the public one; an account that renews asks for itself
export const quotePublicOrder = (input: QuoteInput) => agentApi.post<QuoteAnswer>('/api/v1/public/hosting/quote', input).then((r) => r.data)
export const quoteMyRenewal = (input: QuoteInput) => agentApi.post<QuoteAnswer>('/api/v1/me/hosting/quote', input).then((r) => r.data)

export const listHostingOrders = (status: '' | OrderStatus) =>
  agentApi.get<{ items: AdminOrder[]; total: number }>('/api/v1/hosting/orders', { params: { status: status || undefined } }).then((r) => r.data)

export const confirmHostingOrder = (id: number) =>
  agentApi.post<AdminOrder>(`/api/v1/hosting/orders/${id}/confirm`).then((r) => r.data)

export const cancelHostingOrder = (id: number) =>
  agentApi.post<AdminOrder>(`/api/v1/hosting/orders/${id}/cancel`).then((r) => r.data)

export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

// ─── Domains and subdomains ───────────────────────────────────────────────────

export interface HostingDomain {
  zoneId: string
  name: string
  /** Cloudflare's own status for the zone (superadmin list only) */
  status?: string
  enabled: boolean
  /** The panel addresses of buyers are made on this one */
  isMain?: boolean
}

export const listHostingDomains = () =>
  agentApi.get<{ domains: HostingDomain[] }>('/api/v1/hosting/domains').then((r) => r.data.domains)

export const setHostingDomain = (zoneId: string, enabled: boolean) =>
  agentApi.put<HostingDomain>(`/api/v1/hosting/domains/${encodeURIComponent(zoneId)}`, { enabled }).then((r) => r.data)

export const setMainHostingDomain = (zoneId: string) =>
  agentApi.put<{ ok: boolean }>(`/api/v1/hosting/domains/${encodeURIComponent(zoneId)}/main`).then((r) => r.data)

export type SubdomainStatus = 'pending' | 'active' | 'suspended' | 'error'

export interface Subdomain {
  id: number
  userId: number
  /** Only in the superadmin list */
  username?: string
  label: string
  zoneId: string
  domain: string
  hostname: string
  status: SubdomainStatus
  /** Why a subdomain waits or failed */
  note: string
  /** The address of the owner's own panel: it comes with every plan and is not one of its subdomains */
  panel?: boolean
  createdAt: string
}

export const listAllSubdomains = () =>
  agentApi.get<{ items: Subdomain[] }>('/api/v1/hosting/subdomains').then((r) => r.data.items)

// The superadmin gives an account its panel address (the plan quota does not apply)
export const createSubdomainForUser = (body: { userId: number; label: string; zoneId: string }) =>
  agentApi.post<Subdomain>('/api/v1/hosting/subdomains', body).then((r) => r.data)

export const setSubdomainStatus = (id: number, status: 'active' | 'suspended') =>
  agentApi.patch<Subdomain>(`/api/v1/hosting/subdomains/${id}`, { status }).then((r) => r.data)

export const deleteSubdomainAsAdmin = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/hosting/subdomains/${id}`).then((r) => r.data)

export interface MySubdomains {
  enabled: boolean
  limit: number
  used: number
  domains: HostingDomain[]
  items: Subdomain[]
}

export const getMySubdomains = () => agentApi.get<MySubdomains>('/api/v1/me/subdomains').then((r) => r.data)

export const checkSubdomain = (label: string, zoneId: string) =>
  agentApi
    .get<{ available: boolean; reason: string }>('/api/v1/me/subdomains/check', { params: { label, zoneId } })
    .then((r) => r.data)

export interface CustomDomain {
  id: number
  userId: number
  username?: string
  hostname: string
  status: SubdomainStatus
  sslStatus: string
  note: string
  createdAt: string
  updatedAt: string
  /** cloudflare: Cloudflare for SaaS; direct: served by this server's public proxy */
  provider?: 'cloudflare' | 'direct'
  /** A direct domain puts this in a TXT record to prove it is theirs */
  verifyToken?: string
  verifiedAt?: string | null
}

export interface MyCustomDomains {
  /** The server owner set custom domains up */
  ready: boolean
  /** The ways a new domain can be connected now, the first is the default */
  providers: ('cloudflare' | 'direct')[]
  /** How a new domain is served by default, and what to point it at */
  provider: 'cloudflare' | 'direct'
  /** The name the buyer points their CNAME at */
  target: string
  /** The two addresses, for the domains that were added each way */
  cnameTarget: string
  directTarget: string
  limit: number
  used: number
  items: CustomDomain[]
}

export const getMyCustomDomains = () => agentApi.get<MyCustomDomains>('/api/v1/me/custom-domains').then((r) => r.data)

export const checkCustomDomain = (hostname: string, provider?: 'cloudflare' | 'direct') =>
  agentApi
    .get<{ available: boolean; reason: string; target: string; pointing?: boolean; provider?: 'cloudflare' | 'direct' }>('/api/v1/me/custom-domains/check', { params: { hostname, provider } })
    .then((r) => r.data)

export const createMyCustomDomain = (hostname: string, provider?: 'cloudflare' | 'direct') =>
  agentApi.post<CustomDomain>('/api/v1/me/custom-domains', { hostname, provider }).then((r) => r.data)

export const refreshMyCustomDomain = (id: number) =>
  agentApi.post<CustomDomain>(`/api/v1/me/custom-domains/${id}/refresh`).then((r) => r.data)

export const deleteMyCustomDomain = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/me/custom-domains/${id}`).then((r) => r.data)

export interface CustomDomainSetup {
  ready: boolean
  zoneId: string
  target: string
  items: CustomDomain[]
}

export const getCustomDomainSetup = () => agentApi.get<CustomDomainSetup>('/api/v1/hosting/custom-domains').then((r) => r.data)

export const setupCustomDomains = (zoneId: string) =>
  agentApi.put<CustomDomainSetup>('/api/v1/hosting/custom-domains/setup', { zoneId }).then((r) => r.data)

export const createMySubdomain = (body: { label: string; zoneId: string }) =>
  agentApi.post<Subdomain>('/api/v1/me/subdomains', body).then((r) => r.data)

export const deleteMySubdomain = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/me/subdomains/${id}`).then((r) => r.data)

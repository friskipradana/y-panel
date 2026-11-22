import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { createPublicOrder, getPublicHosting, quotePublicOrder, type PublicAppAddon, type PublicAppAddonLicense } from '@/api/hosting'
import { periodChoices } from '@/components/hosting/PeriodPicker'
import type { SubdomainChoice } from '@/components/hosting/SubdomainPicker'
import { useI18n } from '@/lib/i18n'
import { priceFor } from '@/lib/planPricing'
import { clearOrderDraft, orderDraftIsEmpty, readOrderDraft, writeOrderDraft } from './orderDraft'
import { emailProblem, normalizePhone, passwordProblem, usernameProblem, whatsappProblem, type FieldProblem } from './orderValidation'

export type OrderStep = 'plan' | 'addon' | 'address' | 'account' | 'review'

export interface AccountForm {
  username: string
  email: string
  whatsapp: string
  displayName: string
  password: string
  repeat: string
}

const serverAnswer = (error: unknown) => (error as { response?: { data?: { error?: string; reason?: string } } })?.response?.data ?? {}

function defaultAddonLicense(app: PublicAppAddon | undefined): PublicAppAddonLicense | undefined {
  if (!app || app.licensePlans.length === 0) return undefined
  return app.licensePlans.find((lp) => lp.slug === 'pro-monthly') ?? app.licensePlans.find((lp) => lp.highlighted) ?? app.licensePlans[0]
}

// State of the order stepper: plan, optional app+license add-on, panel address, account, and review
export function useOrderForm() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const query = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  const [draft] = useState(readOrderDraft)
  const [slug, setPlanSlug] = useState(params.get('plan') ?? draft?.slug ?? '')
  const [trial, setTrial] = useState(params.has('trial') ? params.get('trial') === '1' : draft?.trial ?? false)
  const [periods, setPeriods] = useState(params.get('plan') ? '1' : draft?.periods ?? '1')
  const [form, setForm] = useState<AccountForm>({
    username: draft?.username ?? '', email: draft?.email ?? '', whatsapp: draft?.whatsapp ?? '', displayName: draft?.displayName ?? '', password: '', repeat: '',
  })
  const [touched, setTouched] = useState<Partial<Record<keyof AccountForm, boolean>>>({})
  const [address, setAddress] = useState<SubdomainChoice>({ label: draft?.label ?? '', zoneId: draft?.zoneId ?? '', available: false })
  const [step, setStep] = useState<OrderStep>('plan')
  const [voucherText, setVoucherText] = useState(draft?.voucher ?? '')
  const [voucherApplied, setVoucherApplied] = useState('')
  const [addonCatalogId, setAddonCatalogId] = useState(params.get('addon') ?? draft?.addonCatalogId ?? '')
  const [addonPlanSlug, setAddonPlanSlug] = useState(params.get('addonPlan') ?? draft?.addonPlanSlug ?? '')
  const [addonDurationMode, setAddonDurationMode] = useState<'follow' | 'custom'>(draft?.addonDurationMode ?? 'follow')
  const [addonUnits, setAddonUnits] = useState(draft?.addonUnits ?? '1')

  const plans = query.data?.plans ?? []
  const plan = plans.find((p) => p.slug === slug) ?? plans[0]
  const domains = query.data?.domains ?? []
  const legacyAddon = query.data?.appAddon ?? null
  const availableAddons: PublicAppAddon[] =
    query.data?.appAddons && query.data.appAddons.length > 0
      ? query.data.appAddons
      : legacyAddon
        ? [{
            catalogId: legacyAddon.catalogId,
            name: legacyAddon.catalogId === 'reneo-crm' ? 'Reneo CRM Omnichannel' : legacyAddon.catalogId,
            taglineId: '',
            taglineEn: '',
            descriptionId: '',
            descriptionEn: '',
            licensePlans: [{
              id: 1,
              slug: legacyAddon.planSlug,
              name: legacyAddon.planSlug,
              tagline: '',
              period: 'monthly',
              months: 1,
              priceAmount: legacyAddon.priceAmount,
              features: {},
              highlighted: true,
            }],
          }]
        : []

  const trialOffered = !!plan && plan.trialDays > 0
  const isTrial = trial && trialOffered
  const planIncludesApp = !!plan && !!plan.includedCatalogId
  const bundledApp = planIncludesApp ? availableAddons.find((a) => a.catalogId === plan?.includedCatalogId) : undefined
  const bundledLicense = bundledApp?.licensePlans.find((lp) => lp.slug === (plan?.includedLicensePlanSlug || 'pro-monthly')) ?? defaultAddonLicense(bundledApp)
  const choosableAddons = availableAddons.filter((a) => a.catalogId !== plan?.includedCatalogId)
  const hasAddonStep = !isTrial && (choosableAddons.length > 0 || planIncludesApp)

  const selectedAddonApp = choosableAddons.find((a) => a.catalogId === addonCatalogId)
  const selectedAddonLicense = selectedAddonApp
    ? selectedAddonApp.licensePlans.find((lp) => lp.slug === addonPlanSlug) ?? defaultAddonLicense(selectedAddonApp)
    : undefined
  const addonSelected = !isTrial && !!selectedAddonApp && !!selectedAddonLicense

  const needsAddress = !!plan && domains.length > 0
  const whatsappRequired = !!query.data?.whatsapp
  const choices = plan ? periodChoices(plan.period) : [1]
  const maxPeriods = Math.max(...choices)
  const count = choices.includes(Number(periods)) ? Number(periods) : 1
  const hostingMonths = !plan || plan.period === 'once' ? 0 : plan.period === 'yearly' ? count * 12 : count

  const unitMonths = Math.max(1, selectedAddonLicense?.months ?? 1)
  const canFollowPlan = Boolean(selectedAddonLicense && hostingMonths > 0 && hostingMonths % unitMonths === 0)
  const effectiveAddonMode: 'follow' | 'custom' = canFollowPlan && addonDurationMode === 'follow' ? 'follow' : 'custom'
  const maxAddonUnits = Math.max(1, Math.floor(60 / unitMonths))
  const parsedCustomUnits = Math.max(1, Math.min(maxAddonUnits, Number.parseInt(addonUnits, 10) || 1))
  const addonCount = effectiveAddonMode === 'follow' ? Math.max(1, Math.floor(hostingMonths / unitMonths)) : parsedCustomUnits
  const addonMonths = addonSelected && selectedAddonLicense ? addonCount * unitMonths : 0
  const addonAmount = addonSelected && selectedAddonLicense ? selectedAddonLicense.priceAmount * addonCount : 0

  const quoteQuery = useQuery({
    queryKey: ['order-quote', plan?.id, count, voucherApplied, addonSelected ? selectedAddonApp?.catalogId : '', addonSelected ? selectedAddonLicense?.slug : '', addonMonths],
    queryFn: () =>
      quotePublicOrder({
        planId: plan!.id,
        periods: count,
        voucher: voucherApplied,
        addonCatalogId: addonSelected ? selectedAddonApp?.catalogId : undefined,
        addonPlanSlug: addonSelected ? selectedAddonLicense?.slug : undefined,
        addonMonths: addonSelected && addonMonths > 0 ? addonMonths : undefined,
      }),
    enabled: !!plan && !isTrial && voucherApplied !== '',
    staleTime: 10_000,
    retry: 0,
  })
  const voucherAnswer = quoteQuery.data?.voucher
  const voucherValid = voucherApplied !== '' && voucherAnswer?.valid === true
  const basePrice = plan ? priceFor(plan, count) : priceFor({ priceAmount: 0 }, 1)
  const price = voucherApplied && quoteQuery.data
    ? quoteQuery.data.quote
    : { ...basePrice, list: basePrice.list + addonAmount, subtotal: basePrice.subtotal + addonAmount }
  const total = isTrial ? 0 : price.subtotal

  const setSlug = (next: string) => {
    setPlanSlug(next)
    setPeriods('1')
  }

  const selectAddonPlan = (catalogId: string, licenseSlug?: string) => {
    if (!catalogId) {
      setAddonCatalogId('')
      setAddonPlanSlug('')
      return
    }
    const targetApp = choosableAddons.find((a) => a.catalogId === catalogId)
    const fallbackLicense = defaultAddonLicense(targetApp)
    const nextLicense = (licenseSlug && targetApp?.licensePlans.find((lp) => lp.slug === licenseSlug)) || fallbackLicense
    setAddonCatalogId(catalogId)
    setAddonPlanSlug(nextLicense?.slug ?? '')
    const nextUnit = Math.max(1, nextLicense?.months ?? 1)
    const maxUnitsForLicense = Math.max(1, Math.floor(60 / nextUnit))
    setAddonUnits((prev) => String(Math.max(1, Math.min(maxUnitsForLicense, Number.parseInt(prev, 10) || 1))))
  }

  const steps: OrderStep[] = [
    'plan',
    ...(hasAddonStep ? ['addon' as const] : []),
    ...(needsAddress ? ['address' as const] : []),
    'account',
    'review',
  ]

  useEffect(() => {
    if ((step === 'addon' && !hasAddonStep) || (step === 'address' && !needsAddress)) {
      setStep('plan')
    }
  }, [hasAddonStep, needsAddress, step])

  const patch = (next: Partial<AccountForm>) => setForm((current) => ({ ...current, ...next }))
  const touch = (field: keyof AccountForm) => setTouched((current) => ({ ...current, [field]: true }))

  const problems: Record<keyof AccountForm, FieldProblem | null> = {
    username: usernameProblem(form.username),
    email: emailProblem(form.email),
    whatsapp: whatsappProblem(form.whatsapp, whatsappRequired),
    displayName: null,
    password: passwordProblem(form.password),
    repeat: form.repeat !== form.password ? 'passwordMismatch' : form.repeat === '' ? 'required' : null,
  }
  const shown = (field: keyof AccountForm): FieldProblem | null => {
    const problem = problems[field]
    if (!problem) return null
    if (problem === 'required' && !touched[field]) return null
    return problem
  }

  const accountValid = Object.values(problems).every((problem) => problem === null)
  const addressValid = !needsAddress || address.available
  const valid: Record<OrderStep, boolean> = {
    plan: !!plan,
    addon: true,
    address: addressValid,
    account: accountValid,
    review: accountValid && addressValid,
  }
  const phone = normalizePhone(form.whatsapp).value

  useEffect(() => {
    writeOrderDraft({
      slug: plan?.slug ?? slug,
      trial,
      periods,
      username: form.username,
      email: form.email,
      whatsapp: form.whatsapp,
      displayName: form.displayName,
      label: address.label,
      zoneId: address.zoneId,
      voucher: voucherText,
      addonCatalogId,
      addonPlanSlug,
      addonDurationMode,
      addonUnits,
    })
  }, [plan?.slug, slug, trial, periods, form.username, form.email, form.whatsapp, form.displayName, address.label, address.zoneId, voucherText, addonCatalogId, addonPlanSlug, addonDurationMode, addonUnits])

  const submit = useMutation({
    mutationFn: () =>
      createPublicOrder({
        planId: plan!.id,
        kind: isTrial ? 'trial' : 'new',
        periods: isTrial ? 1 : count,
        username: form.username,
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        password: form.password,
        whatsapp: phone || undefined,
        voucher: voucherValid ? voucherApplied : undefined,
        addonCatalogId: addonSelected && selectedAddonApp ? selectedAddonApp.catalogId : undefined,
        addonPlanSlug: addonSelected && selectedAddonLicense ? selectedAddonLicense.slug : undefined,
        addonMonths: addonSelected && addonMonths > 0 ? addonMonths : undefined,
        ...(needsAddress ? { subLabel: address.label, subZoneId: address.zoneId } : {}),
      }),
    onSuccess: (order) => {
      clearOrderDraft()
      navigate(`/order/${order.publicId}`)
    },
    onError: (error) => {
      const { error: message, reason } = serverAnswer(error)
      if (reason === 'accountTaken') {
        toast.error(t('order.error.accountTaken'))
        setStep('account')
      } else if (reason && reason !== 'accountTaken') {
        toast.error(t(`order.voucher.reason.${reason}`))
      } else {
        toast.error(message ?? t('order.failed'))
      }
    },
  })

  const index = steps.indexOf(step)
  const canOpen = (target: OrderStep) => steps.slice(0, steps.indexOf(target)).every((previous) => valid[previous])
  const next = () => {
    if (valid[step] && index < steps.length - 1) setStep(steps[index + 1])
  }
  const back = () => {
    if (index > 0) setStep(steps[index - 1])
  }

  return {
    query, plans, plan, domains, slug, setSlug, trial, setTrial, trialOffered, isTrial, periods, setPeriods, maxPeriods, count, hostingMonths, total,
    availableAddons, choosableAddons, planIncludesApp, bundledApp, bundledLicense,
    addonCatalogId, addonSelected, selectedAddonApp, selectedAddonLicense, selectAddonPlan,
    addonDurationMode, effectiveAddonMode, canFollowPlan, setAddonDurationMode,
    addonCount, maxAddonUnits, unitMonths, addonMonths, addonAmount, setAddonUnits,
    basePrice, price, voucherText, setVoucherText, voucherApplied, voucherAnswer, voucherValid, voucherChecking: quoteQuery.isFetching, voucherFailed: quoteQuery.isError,
    applyVoucher: () => setVoucherApplied(voucherText.trim().toUpperCase()),
    removeVoucher: () => {
      setVoucherApplied('')
      setVoucherText('')
    },
    form, patch, touch, shown, problems, address, setAddress, needsAddress, whatsappRequired, phone,
    steps, step, setStep, index, valid, canOpen, next, back, submit,
    restored: !orderDraftIsEmpty(draft),
  }
}

export type OrderFormState = ReturnType<typeof useOrderForm>

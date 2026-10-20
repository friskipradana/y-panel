import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { createPublicOrder, getPublicHosting, quotePublicOrder } from '@/api/hosting'
import { priceFor } from '@/lib/planPricing'
import type { SubdomainChoice } from '@/components/hosting/SubdomainPicker'
import { periodChoices } from '@/components/hosting/PeriodPicker'
import { clearOrderDraft, orderDraftIsEmpty, readOrderDraft, writeOrderDraft } from './orderDraft'
import { emailProblem, normalizePhone, passwordProblem, usernameProblem, whatsappProblem, type FieldProblem } from './orderValidation'

export type OrderStep = 'plan' | 'address' | 'account' | 'review'

export interface AccountForm {
  username: string
  email: string
  whatsapp: string
  displayName: string
  password: string
  repeat: string
}

const serverAnswer = (error: unknown) => (error as { response?: { data?: { error?: string; reason?: string } } })?.response?.data ?? {}

// State of the order stepper: the plan, the panel address and the account, what is wrong with each, and the order itself
export function useOrderForm() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const query = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  // what was typed before a reload or a closed tab; a plan chosen through the address (?plan=) wins over the one that was kept
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

  const plans = query.data?.plans ?? []
  const plan = plans.find((p) => p.slug === slug) ?? plans[0]
  const domains = query.data?.domains ?? []
  const trialOffered = !!plan && plan.trialDays > 0
  const isTrial = trial && trialOffered
  // the panel address comes with every plan, on the main domain: picked here, created when the order is paid
  const needsAddress = !!plan && domains.length > 0
  const whatsappRequired = !!query.data?.whatsapp
  const choices = plan ? periodChoices(plan.period) : [1]
  const maxPeriods = Math.max(...choices)
  const count = choices.includes(Number(periods)) ? Number(periods) : 1
  // the price: worked out here until a voucher is used, then asked of the agent, which says if the code works and what it takes off
  const quoteQuery = useQuery({
    queryKey: ['order-quote', plan?.id, count, voucherApplied],
    queryFn: () => quotePublicOrder({ planId: plan!.id, periods: count, voucher: voucherApplied }),
    enabled: !!plan && !isTrial && voucherApplied !== '',
    staleTime: 10_000,
    retry: 0,
  })
  const voucherAnswer = quoteQuery.data?.voucher
  const voucherValid = voucherApplied !== '' && voucherAnswer?.valid === true
  const price = plan ? (voucherApplied && quoteQuery.data ? quoteQuery.data.quote : priceFor(plan, count)) : priceFor({ priceAmount: 0 }, 1)
  const total = isTrial ? 0 : price.subtotal

  // another plan may count in another period (months or years): start from the first choice
  const setSlug = (next: string) => {
    setPlanSlug(next)
    setPeriods('1')
  }

  const steps: OrderStep[] = needsAddress ? ['plan', 'address', 'account', 'review'] : ['plan', 'account', 'review']

  const patch = (next: Partial<AccountForm>) => setForm((current) => ({ ...current, ...next }))
  const touch = (field: keyof AccountForm) => setTouched((current) => ({ ...current, [field]: true }))

  // a problem shows once the buyer typed something or left the field; an empty field untouched stays quiet
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
  const valid: Record<OrderStep, boolean> = { plan: !!plan, address: addressValid, account: accountValid, review: accountValid && addressValid }
  const phone = normalizePhone(form.whatsapp).value

  // keep the draft in step with the form, except the password
  useEffect(() => {
    writeOrderDraft({
      slug: plan?.slug ?? slug, trial, periods, username: form.username, email: form.email, whatsapp: form.whatsapp, displayName: form.displayName,
      label: address.label, zoneId: address.zoneId, voucher: voucherText,
    })
  }, [plan?.slug, slug, trial, periods, form.username, form.email, form.whatsapp, form.displayName, address.label, address.zoneId, voucherText])

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
        ...(needsAddress ? { subLabel: address.label, subZoneId: address.zoneId } : {}),
      }),
    onSuccess: (order) => {
      clearOrderDraft()
      navigate(`/order/${order.publicId}`)
    },
    onError: (error) => {
      const { error: message, reason } = serverAnswer(error)
      if (reason === 'accountTaken') {
        // the account is the problem, so that is where the buyer goes to change it
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
  // a step can be opened when every step before it is valid
  const canOpen = (target: OrderStep) => steps.slice(0, steps.indexOf(target)).every((previous) => valid[previous])
  const next = () => {
    if (valid[step] && index < steps.length - 1) setStep(steps[index + 1])
  }
  const back = () => {
    if (index > 0) setStep(steps[index - 1])
  }

  return {
    query, plans, plan, domains, slug, setSlug, trial, setTrial, trialOffered, isTrial, periods, setPeriods, maxPeriods, count, total,
    price, voucherText, setVoucherText, voucherApplied, voucherAnswer, voucherValid, voucherChecking: quoteQuery.isFetching, voucherFailed: quoteQuery.isError,
    applyVoucher: () => setVoucherApplied(voucherText.trim().toUpperCase()),
    removeVoucher: () => {
      setVoucherApplied('')
      setVoucherText('')
    },
    form, patch, touch, shown, problems, address, setAddress, needsAddress, whatsappRequired, phone,
    steps, step, setStep, index, valid, canOpen, next, back, submit,
    // the form was filled in from a draft: the buyer is told, and the password is the one thing to type again
    restored: !orderDraftIsEmpty(draft),
  }
}

export type OrderFormState = ReturnType<typeof useOrderForm>

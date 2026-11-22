import { CircleCheck } from 'lucide-react'
import { Field, TextInput } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useI18n } from '@/lib/i18n'
import type { FieldProblem } from './orderValidation'
import type { AccountForm, OrderFormState } from './useOrderForm'

// Step 3: who the buyer is and how to sign in; every field says what is wrong while the buyer types
export function OrderStepAccount({ order }: { order: OrderFormState }) {
  const { t } = useI18n()
  const { form, patch, touch, shown, problems, whatsappRequired, phone } = order

  const error = (field: keyof AccountForm) => {
    const problem: FieldProblem | null = shown(field)
    return problem ? t(`order.problem.${problem}`) : undefined
  }
  const ok = (field: keyof AccountForm) => form[field] !== '' && problems[field] === null

  return (
    <section className="space-y-3">
      <Field label={t('order.username')} htmlFor="order-username" hint={t('order.usernameHint')} error={error('username')}>
        <TextInput
          id="order-username"
          mono
          autoComplete="username"
          maxLength={30}
          value={form.username}
          invalid={!!error('username')}
          onChange={(e) => patch({ username: e.target.value.toLowerCase().trim() })}
          onBlur={() => touch('username')}
        />
      </Field>
      <Field label={t('order.email')} htmlFor="order-email" error={error('email')}>
        <TextInput
          id="order-email"
          type="email"
          autoComplete="email"
          value={form.email}
          invalid={!!error('email')}
          onChange={(e) => patch({ email: e.target.value })}
          onBlur={() => touch('email')}
        />
      </Field>
      <Field
        label={t('order.whatsapp')}
        htmlFor="order-whatsapp"
        hint={ok('whatsapp') ? t('order.whatsappSentTo', { number: `+${phone}` }) : t(whatsappRequired ? 'order.whatsappHint' : 'order.whatsappOptionalHint')}
        error={error('whatsapp')}
      >
        <TextInput
          id="order-whatsapp"
          mono
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812 3456 7890"
          value={form.whatsapp}
          invalid={!!error('whatsapp')}
          onChange={(e) => patch({ whatsapp: e.target.value })}
          onBlur={() => touch('whatsapp')}
        />
      </Field>
      <Field label={t('order.displayName')} htmlFor="order-name">
        <TextInput id="order-name" autoComplete="name" maxLength={60} value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
      </Field>
      <Field label={t('order.password')} htmlFor="order-password" hint={t('order.passwordHint')} error={error('password')}>
        <PasswordInput
          id="order-password"
          autoComplete="new-password"
          value={form.password}
          invalid={!!error('password')}
          onChange={(e) => patch({ password: e.target.value })}
          onBlur={() => touch('password')}
        />
      </Field>
      <Field label={t('order.repeatPassword')} htmlFor="order-repeat" error={error('repeat')}>
        <PasswordInput
          id="order-repeat"
          autoComplete="new-password"
          value={form.repeat}
          invalid={!!error('repeat')}
          onChange={(e) => patch({ repeat: e.target.value })}
          onBlur={() => touch('repeat')}
        />
      </Field>
      {ok('repeat') && ok('password') ? (
        <p role="status" className="flex items-center gap-1.5 text-[12px] text-[var(--panel-success-text)]">
          <CircleCheck size={13} aria-hidden="true" />
          {t('order.passwordMatch')}
        </p>
      ) : null}
    </section>
  )
}

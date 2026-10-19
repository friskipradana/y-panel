import { Plus, Trash2 } from 'lucide-react'
import type { OrderMethod } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { TextInput } from '@/components/ui/Field'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useI18n } from '@/lib/i18n'

export const MAX_METHODS = 10

export const blankMethod = (): OrderMethod => ({ id: '', kind: 'bank', name: '', account: '', holder: '', enabled: true })

// A method is ready when buyers can be shown it: it has a name, a number and a holder
export const methodReady = (method: OrderMethod) => method.name.trim() !== '' && method.account.trim() !== '' && method.holder.trim() !== ''

// The banks and e-wallets buyers can pay to, one row each: kind, name, number, holder, on or off
export function PaymentMethodsEditor({ methods, onChange }: { methods: OrderMethod[]; onChange: (next: OrderMethod[]) => void }) {
  const { t } = useI18n()
  const update = (index: number, patch: Partial<OrderMethod>) => onChange(methods.map((method, i) => (i === index ? { ...method, ...patch } : method)))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[12.5px] font-semibold text-[var(--win-text)]">{t('hosting.payment.methods')}</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t('hosting.payment.methodsHint')}</p>
        </div>
        <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled={methods.length >= MAX_METHODS} onClick={() => onChange([...methods, blankMethod()])}>
          {t('hosting.payment.addMethod')}
        </Button>
      </div>

      {methods.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--win-border)] px-3 py-4 text-center text-[12px] text-[var(--text-secondary)]">{t('hosting.payment.noMethods')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {methods.map((method, index) => (
            <li
              key={method.id || `new-${index}`}
              className="grid items-center gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]"
            >
              <Select
                value={method.kind}
                onChange={(kind) => update(index, { kind: kind as OrderMethod['kind'] })}
                options={[
                  { value: 'bank', label: t('hosting.payment.kindBank') },
                  { value: 'ewallet', label: t('hosting.payment.kindEwallet') },
                ]}
                buttonClassName="!h-8 px-2.5 text-[12px]"
              />
              <TextInput
                value={method.name}
                maxLength={80}
                aria-label={t('hosting.payment.methodName')}
                placeholder={method.kind === 'bank' ? 'BCA' : 'DANA'}
                onChange={(e) => update(index, { name: e.target.value })}
                className="!h-8 text-[12px]"
              />
              <TextInput
                mono
                value={method.account}
                maxLength={80}
                aria-label={t('hosting.payment.account')}
                placeholder={t('hosting.payment.accountPlaceholder')}
                onChange={(e) => update(index, { account: e.target.value })}
                className="!h-8 text-[12px]"
              />
              <TextInput
                value={method.holder}
                maxLength={80}
                aria-label={t('hosting.payment.holder')}
                placeholder={t('hosting.payment.holder')}
                onChange={(e) => update(index, { holder: e.target.value })}
                className="!h-8 text-[12px]"
              />
              <ToggleSwitch checked={method.enabled} label={t('hosting.payment.methodShown')} onChange={() => update(index, { enabled: !method.enabled })} />
              <IconButton label={t('common.delete')} tone="danger" onClick={() => onChange(methods.filter((_, i) => i !== index))}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

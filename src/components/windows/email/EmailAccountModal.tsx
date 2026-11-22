import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Forward, Inbox, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  createEmailAccount,
  updateEmailAccount,
  type EmailAccount,
  type EmailAccountMode,
} from '@/api/email'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { OptionCards } from '@/components/windows/settings/OptionCards'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

interface EmailAccountModalProps {
  open: boolean
  defaultDomain: string
  editing: EmailAccount | null
  onClose: () => void
}

const getApiError = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ? (localizeServerMessage(msg) ?? msg) : fallback
}

export function EmailAccountModal({
  open,
  defaultDomain,
  editing,
  onClose,
}: EmailAccountModalProps) {
  const { t } = useI18n()
  const qc = useQueryClient()

  const [localPart, setLocalPart] = useState('')
  const [domain, setDomain] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [mode, setMode] = useState<EmailAccountMode>('mailbox')
  const [forwardTo, setForwardTo] = useState('')
  const [password, setPassword] = useState('')
  const [quotaMb, setQuotaMb] = useState(1024)
  const [enabled, setEnabled] = useState(true)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setLocalPart(editing.localPart)
      setDomain(editing.domain)
      setDisplayName(editing.displayName)
      setMode(editing.mode)
      setForwardTo(editing.forwardTo)
      setPassword('')
      setQuotaMb(editing.quotaMb || 1024)
      setEnabled(editing.enabled)
      setNote(editing.note)
    } else {
      setLocalPart('')
      setDomain(defaultDomain)
      setDisplayName('')
      setMode('mailbox')
      setForwardTo('')
      setPassword('')
      setQuotaMb(1024)
      setEnabled(true)
      setNote('')
    }
  }, [open, editing, defaultDomain])

  const saveMut = useMutation({
    mutationFn: () => {
      if (editing) {
        return updateEmailAccount(editing.id, {
          displayName,
          mode,
          forwardTo,
          password: password.trim() || undefined,
          quotaMb,
          enabled,
          note,
        })
      }
      return createEmailAccount({
        localPart,
        domain: domain.trim() || defaultDomain,
        displayName,
        mode,
        forwardTo,
        password: password.trim() || undefined,
        quotaMb,
        enabled,
        note,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['email-accounts'] })
      void qc.invalidateQueries({ queryKey: ['email-overview'] })
      toast.success(editing ? t('email.account.updated') : t('email.account.created'))
      onClose()
    },
    onError: (err) => toast.error(getApiError(err, t('email.account.saveFailed'))),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('email.modal.editTitle') : t('email.modal.createTitle')}
      subtitle={t('email.modal.subtitle')}
      icon={<Mail className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {editing ? t('common.save') : t('email.modal.submitCreate')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {editing ? (
          <Field label={t('email.col.address')}>
            <TextInput mono value={editing.address} disabled />
          </Field>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label={t('email.modal.localPartLabel')}>
              <TextInput
                mono
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder={t('email.ph.localPart')}
              />
            </Field>
            <Field label={t('email.modal.domainLabel')}>
              <TextInput
                mono
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={defaultDomain || t('email.ph.domain')}
              />
            </Field>
          </div>
        )}

        <Field label={t('email.modal.displayNameLabel')}>
          <TextInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('email.ph.displayName')}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-[0.75rem] font-semibold text-[var(--win-text)]">
            {t('email.modal.modeLabel')}
          </p>
          <OptionCards<EmailAccountMode>
            label={t('email.modal.modeLabel')}
            value={mode}
            onChange={setMode}
            options={[
              {
                key: 'mailbox',
                label: t('email.mode.mailbox'),
                description: t('email.mode.mailboxDesc'),
                icon: <Inbox />,
              },
              {
                key: 'forward',
                label: t('email.mode.forward'),
                description: t('email.mode.forwardDesc'),
                icon: <Forward />,
              },
            ]}
          />
        </div>

        {mode === 'mailbox' ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field
              label={t('email.modal.passwordLabel')}
              hint={editing?.passwordSet ? t('email.settings.smtpPassSavedHint') : undefined}
            >
              <PasswordInput
                mono
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing?.passwordSet ? '••••••••••••' : t('email.modal.passwordPlaceholder')}
              />
            </Field>
            <Field label={t('email.modal.quotaLabel')}>
              <Select
                value={String(quotaMb)}
                onChange={(val) => setQuotaMb(Number(val) || 1024)}
                options={[
                  { value: '512', label: '512 MB' },
                  { value: '1024', label: '1 GB (1024 MB)' },
                  { value: '2048', label: '2 GB (2048 MB)' },
                  { value: '5120', label: '5 GB (5120 MB)' },
                  { value: '10240', label: '10 GB (10240 MB)' },
                ]}
              />
            </Field>
          </div>
        ) : (
          <Field label={t('email.modal.forwardToLabel')} hint={t('email.modal.forwardToHint')}>
            <TextInput
              mono
              value={forwardTo}
              onChange={(e) => setForwardTo(e.target.value)}
              placeholder={t('email.ph.forwardTo')}
            />
          </Field>
        )}

        <Field label={t('email.modal.noteLabel')}>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('email.modal.notePlaceholder')}
          />
        </Field>

        <SettingRow
          title={t('email.modal.enabledLabel')}
          description={t('email.modal.enabledDesc')}
          control={
            <ToggleSwitch
              checked={enabled}
              onChange={() => setEnabled((prev) => !prev)}
              label={t('email.modal.enabledLabel')}
            />
          }
        />
      </div>
    </Modal>
  )
}

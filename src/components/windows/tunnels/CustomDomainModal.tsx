import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Globe, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { checkCustomDomain, createMyCustomDomain } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

interface Props {
  open: boolean
  target: string
  onClose: () => void
  onCreated: () => void
}

// Adding a domain of the buyer's own: the name is checked while typing, then the CNAME to create is shown
export function CustomDomainModal(props: Props) {
  // a fresh form for every opening
  return <CustomDomainForm key={props.open ? 'open' : 'closed'} {...props} />
}

function CustomDomainForm({ open, target, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const [hostname, setHostname] = useState('')
  const [settled, setSettled] = useState('')
  const [error, setError] = useState('')

  // wait for a pause in typing before asking the agent
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(hostname), 500)
    return () => window.clearTimeout(timer)
  }, [hostname])

  const ready = hostname.includes('.') && settled === hostname
  const check = useQuery({
    queryKey: ['custom-domain-check', settled],
    queryFn: () => checkCustomDomain(settled),
    enabled: open && ready,
    staleTime: 10_000,
    retry: 0,
  })

  const create = useMutation({
    mutationFn: () => createMyCustomDomain(hostname),
    onSuccess: (row) => {
      toast.success(t('hosting.custom.created', { hostname: row.hostname }))
      onCreated()
      onClose()
    },
    onError: (e) => setError(apiError(e, t('hosting.custom.createFailed'))),
  })

  const busy = check.isFetching || (hostname.includes('.') && settled !== hostname)
  const available = ready && !busy && check.data?.available === true
  const hint = !hostname
    ? t('hosting.custom.hint')
    : !hostname.includes('.')
      ? t('hosting.custom.hintFull')
      : busy
        ? t('hosting.sub.checking')
        : check.isError
          ? t('hosting.sub.checkFailed')
          : check.data?.available
            ? t('hosting.custom.available')
            : localizeServerMessage(check.data?.reason) ?? (check.data?.reason || t('hosting.sub.taken'))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('hosting.custom.newTitle')}
      subtitle={t('hosting.custom.newSubtitle')}
      icon={<Globe />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!available} loading={create.isPending} onClick={() => create.mutate()}>
            {t('hosting.custom.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('hosting.custom.domain')} htmlFor="custom-domain">
          <TextInput
            id="custom-domain"
            mono
            value={hostname}
            maxLength={253}
            autoComplete="off"
            placeholder={t('hosting.custom.placeholder')}
            onChange={(e) => {
              setHostname(e.target.value.toLowerCase().trim())
              setError('')
            }}
          />
        </Field>

        <p
          role="status"
          className={`flex items-center gap-1.5 text-[12px] ${available ? 'text-[var(--panel-success-text)]' : hostname && !busy && ready ? 'text-[var(--panel-danger-text)]' : 'text-[var(--text-secondary)]'}`}
        >
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : available ? <CircleCheck size={13} /> : hostname && ready ? <CircleAlert size={13} /> : null}
          {hint}
        </p>

        <div className="space-y-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5 text-[12.5px]">
          <p className="font-medium">{t('hosting.custom.stepsTitle')}</p>
          <p className="text-[var(--text-secondary)]">{t('hosting.custom.steps')}</p>
          <p className="panel-mono">
            CNAME&nbsp; {hostname || 'toko.com'} &rarr; {target}
          </p>
          {available && check.data ? (
            <p className={check.data.pointing ? 'text-[var(--panel-success-text)]' : 'text-[var(--text-secondary)]'}>
              {check.data.pointing ? t('hosting.custom.pointing') : t('hosting.custom.notPointing')}
            </p>
          ) : null}
        </div>

        {error ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p> : null}
      </div>
    </Modal>
  )
}

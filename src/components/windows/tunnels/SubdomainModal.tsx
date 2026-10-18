import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import { checkSubdomain, type HostingDomain } from '@/api/hosting'
import { SubdomainPicker, type SubdomainChoice } from '@/components/hosting/SubdomainPicker'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

interface SubdomainModalProps {
  open: boolean
  domains: HostingDomain[]
  saving: boolean
  error: string
  onClose: () => void
  onCreate: (body: { label: string; zoneId: string }) => void
}

// Pick the name of the address of the buyer's panel under one of the offered domains
export function SubdomainModal(props: SubdomainModalProps) {
  // a fresh form for every opening
  return <SubdomainForm key={props.open ? 'open' : 'closed'} {...props} />
}

function SubdomainForm({ open, domains, saving, error, onClose, onCreate }: SubdomainModalProps) {
  const { t } = useI18n()
  const [choice, setChoice] = useState<SubdomainChoice>({ label: '', zoneId: domains[0]?.zoneId ?? '', available: false })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('hosting.sub.newTitle')}
      subtitle={t('hosting.sub.newSubtitle')}
      icon={<Globe2 />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!choice.available} loading={saving} onClick={() => onCreate({ label: choice.label, zoneId: choice.zoneId })}>
            {t('hosting.sub.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SubdomainPicker domains={domains} check={checkSubdomain} onChange={setChoice} enabled={open} />
        {error ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p> : null}
      </div>
    </Modal>
  )
}

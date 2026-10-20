import { useState } from 'react'
import { Radio } from 'lucide-react'
import type { LocalAddress } from '@/api/publicProxy'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

// Opening the web ports is the superadmin's decision: the proxy does not start until they say that this server has a public address
export function PublicIpConfirmModal({ open, addresses, wantHttp, wantHttps, loading, onClose, onConfirm }: {
  open: boolean
  addresses: LocalAddress[]
  wantHttp: string
  wantHttps: string
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const [agreed, setAgreed] = useState(false)
  const hasPublic = addresses.some((a) => a.public)

  const close = () => {
    setAgreed(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('publicip.confirm.title')}
      subtitle={t('publicip.confirm.subtitle')}
      icon={<Radio />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!agreed} loading={loading} onClick={onConfirm}>
            {t('publicip.confirm.action')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[0.8125rem] leading-relaxed">
        <ul className="list-disc space-y-1.5 pl-5 text-[var(--text-secondary)]">
          <li>{t('publicip.confirm.point1', { http: wantHttp, https: wantHttps })}</li>
          <li>{t('publicip.confirm.point2')}</li>
          <li>{t('publicip.confirm.point3')}</li>
        </ul>
        <p className="panel-muted-block px-3 py-2 text-[0.75rem] text-[var(--text-secondary)]">
          {hasPublic ? t('publicip.confirm.hasPublic') : t('publicip.confirm.noPublic')}
        </p>
        <Checkbox checked={agreed} onChange={setAgreed} label={t('publicip.confirm.agree')} />
      </div>
    </Modal>
  )
}

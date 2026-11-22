import { useMemo } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

const LAST_LINES = 30

// The text of the terminal as ordinary text a phone can select (press and hold, drag the handles) and copy: the terminal itself
// draws on a canvas, which a phone cannot select from.
export function TerminalCopyModal({ text, open, onClose }: { text: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const last = useMemo(() => text.split('\n').slice(-LAST_LINES).join('\n'), [text])

  const copy = async (value: string) => {
    try {
      await copyTextToClipboard(value)
      toast.success(t('terminal.copy.copied'))
    } catch {
      toast.error(t('terminal.copy.failed'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('terminal.copy.title')}
      subtitle={t('terminal.copy.hint')}
      icon={<Copy />}
      size="sheet"
      className="ht-modal"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button type="button" variant="outline" disabled={!text} onClick={() => void copy(last)}>{t('terminal.copy.last', { count: LAST_LINES })}</Button>
          <Button type="button" variant="primary" disabled={!text} onClick={() => void copy(text)}>{t('terminal.copy.all')}</Button>
        </>
      }
    >
      {text ? <pre className="ht-copy__text">{text}</pre> : <p className="ht-copy__empty">{t('terminal.copy.empty')}</p>}
    </Modal>
  )
}

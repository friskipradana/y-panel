import { useEffect, useRef, useState } from 'react'
import { Wrench } from 'lucide-react'
import { streamToolchain } from '@/api/toolchain'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

export interface ToolchainRun {
  action: 'install' | 'remove'
  tool: string
  name: string
  version: string
}

type Phase = 'running' | 'done' | 'failed' | 'cancelled'

// Installs or removes a tool of the account and shows what the installer prints while it works.
export function ToolchainRunModal({ run, onClose, onFinished }: { run: ToolchainRun | null; onClose: () => void; onFinished: () => void }) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('running')
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const startedFor = useRef<ToolchainRun | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const start = async (current: ToolchainRun) => {
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('running')
    setLines([])
    setError('')
    try {
      await streamToolchain(
        current.action,
        current.tool,
        current.version,
        (event) => {
          if (event.type === 'log') setLines((all) => [...all.slice(-400), event.line ?? ''])
          if (event.type === 'done') setPhase('done')
          if (event.type === 'error') {
            setError(event.error ?? '')
            setPhase('failed')
          }
        },
        controller.signal,
      )
      setPhase((now) => (now === 'running' ? 'failed' : now))
    } catch (e) {
      if (controller.signal.aborted) setPhase('cancelled')
      else {
        setError((e as Error).message)
        setPhase('failed')
      }
    } finally {
      onFinished()
    }
  }

  // a new request starts at once, once (a second pass of the effect must not start it again)
  useEffect(() => {
    if (run && startedFor.current !== run) {
      startedFor.current = run
      void start(run)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  if (!run) return null
  const busy = phase === 'running'
  const close = () => {
    if (busy) return
    startedFor.current = null
    onClose()
  }

  return (
    <Modal
      open
      onClose={close}
      title={t(run.action === 'install' ? 'toolchain.run.installTitle' : 'toolchain.run.removeTitle', { name: run.name })}
      subtitle={run.version ? t('toolchain.run.version', { version: run.version }) : undefined}
      icon={<Wrench />}
      size="lg"
      footer={
        <>
          {busy ? (
            <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
              {t('toolchain.run.cancel')}
            </Button>
          ) : (
            <Button type="button" variant={phase === 'done' ? 'primary' : 'ghost'} onClick={close}>
              {t('common.close')}
            </Button>
          )}
          {phase === 'failed' || phase === 'cancelled' ? (
            <Button type="button" variant="primary" onClick={() => void start(run)}>
              {t('toolchain.run.retry')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="docker-update">
        <div className="docker-progress-terminal docker-update__log" ref={logRef} role="log" aria-live="polite" aria-label={t('toolchain.run.log')}>
          {lines.length === 0 ? <div className="docker-progress-line docker-progress-line--info">{t('toolchain.run.waiting')}</div> : null}
          {lines.map((line, i) => (
            <div key={i} className="docker-progress-line docker-progress-line--info">{line}</div>
          ))}
          {error ? <div className="docker-progress-line docker-progress-line--error">{error}</div> : null}
        </div>
        <div className="docker-update__outcome">
          {busy ? <Badge tone="primary" dot>{t('toolchain.run.working')}</Badge> : null}
          {phase === 'done' ? <Badge tone="success" dot>{t(run.action === 'install' ? 'toolchain.run.installed' : 'toolchain.run.removed', { name: run.name })}</Badge> : null}
          {phase === 'failed' ? <Badge tone="danger" dot>{t('toolchain.run.failed')}</Badge> : null}
          {phase === 'cancelled' ? <Badge tone="warning" dot>{t('toolchain.run.cancelled')}</Badge> : null}
        </div>
      </div>
    </Modal>
  )
}

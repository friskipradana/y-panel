import { useEffect, useRef, useState } from 'react'
import { CircleArrowUp, CircleCheck, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react'
import { streamDockerUpdate, type DockerUpdateContainer, type DockerUpdateRequest } from '@/api/dockerUpdate'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'
import { StatusPill } from './DockerComponents'

export type DockerUpdateTarget =
  | { kind: 'container'; id: string; name: string; image: string; autoStart?: boolean }
  | { kind: 'waha'; name: string; image: string; autoStart?: boolean }
  | { kind: 'image'; image: string; registryAuth?: Extract<DockerUpdateRequest, { kind: 'image' }>['registryAuth']; autoStart?: boolean }

type Phase = 'ready' | 'running' | 'done' | 'failed' | 'cancelled'
type Step = 'pull' | 'recreate'

interface LogLine {
  text: string
  kind: 'info' | 'system' | 'error'
}

interface Result {
  changed: boolean
  recreated: boolean
}

// Downloads the newest image, shows what Docker prints while it does, and for a container made by compose makes it again from the
// new image. The state of the container is read again at the end, so what the window shows is what the server holds.
export function DockerUpdateModal({
  target,
  onClose,
  onFinished,
  onApplyToContainer,
}: {
  target: DockerUpdateTarget | null
  onClose: () => void
  onFinished: () => void
  onApplyToContainer: (container: DockerUpdateContainer) => void
}) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('ready')
  const [step, setStep] = useState<Step | null>(null)
  const [lines, setLines] = useState<LogLine[]>([])
  const [containers, setContainers] = useState<DockerUpdateContainer[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const startedFor = useRef<DockerUpdateTarget | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const start = async (current: DockerUpdateTarget) => {
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('running')
    setStep('pull')
    setLines([])
    setContainers([])
    setResult(null)
    setError('')
    const request: DockerUpdateRequest =
      current.kind === 'container'
        ? { kind: 'container', id: current.id }
        : current.kind === 'waha'
          ? { kind: 'waha' }
          : { kind: 'image', image: current.image, registryAuth: current.registryAuth }
    try {
      await streamDockerUpdate(
        request,
        (event) => {
          switch (event.type) {
            case 'log':
              setLines((all) => [...all.slice(-400), { text: event.line ?? '', kind: 'info' }])
              break
            case 'step':
              if (event.step) setStep(event.step)
              break
            case 'status':
              if (event.container) {
                const next = event.container
                setContainers((all) => (all.some((c) => c.name === next.name) ? all.map((c) => (c.name === next.name ? next : c)) : [...all, next]))
              }
              break
            case 'containers':
              setContainers(event.containers ?? [])
              break
            case 'done':
              setResult({ changed: !!event.changed, recreated: !!event.recreated })
              setPhase('done')
              break
            case 'error':
              setError(event.error ?? '')
              setLines((all) => [...all, { text: event.error ?? '', kind: 'error' }])
              setPhase('failed')
              break
          }
        },
        controller.signal,
      )
      setPhase((now) => (now === 'running' ? 'failed' : now))
    } catch (e) {
      if (controller.signal.aborted) {
        setPhase('cancelled')
      } else {
        setError((e as Error).message)
        setPhase('failed')
      }
    } finally {
      setStep(null)
      onFinished()
    }
  }

  // a new target starts from the beginning; one that asks to start at once does so, once
  useEffect(() => {
    if (!target) return
    if (startedFor.current !== target) {
      startedFor.current = target
      setPhase('ready')
      setLines([])
      setContainers([])
      setResult(null)
      setError('')
      if (target.autoStart) void start(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  if (!target) return null
  // the WhatsApp runtime is a container too: its image is downloaded and the container made again by the agent
  const isContainer = target.kind === 'container' || target.kind === 'waha'
  const busy = phase === 'running'
  const label = isContainer ? target.name : target.image

  const close = () => {
    if (busy) return
    startedFor.current = null
    onClose()
  }

  const stepState = (name: Step) => {
    if (phase === 'ready') return 'pending'
    if (step === name) return 'active'
    if (phase === 'done') return name === 'recreate' && !result?.recreated ? 'skipped' : 'done'
    if (name === 'pull') return step === 'recreate' ? 'done' : phase === 'failed' ? 'failed' : 'pending'
    return phase === 'failed' ? 'failed' : 'pending'
  }
  const steps: Step[] = isContainer ? ['pull', 'recreate'] : ['pull']

  const summary = () => {
    if (!result) return null
    if (isContainer) {
      if (result.recreated) return { tone: 'success' as const, text: t('docker.update.result.updated') }
      if (result.changed) return { tone: 'warning' as const, text: t('docker.update.result.notCompose') }
      return { tone: 'success' as const, text: t('docker.update.result.upToDate') }
    }
    return result.changed
      ? { tone: 'success' as const, text: t('docker.update.result.pulled') }
      : { tone: 'success' as const, text: t('docker.update.result.upToDate') }
  }
  const outcome = summary()

  return (
    <Modal
      open
      onClose={close}
      title={t(isContainer ? 'docker.update.titleContainer' : 'docker.update.titleImage', { name: label })}
      subtitle={target.image}
      icon={<CircleArrowUp />}
      size="lg"
      footer={
        <>
          {busy ? (
            <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
              {t('docker.update.cancel')}
            </Button>
          ) : (
            <Button type="button" variant={phase === 'ready' ? 'ghost' : 'primary'} onClick={close}>
              {t('common.close')}
            </Button>
          )}
          {phase === 'ready' ? (
            <Button type="button" variant="primary" icon={<CircleArrowUp size={14} />} onClick={() => void start(target)}>
              {t('docker.update.start')}
            </Button>
          ) : null}
          {phase === 'failed' || phase === 'cancelled' ? (
            <Button type="button" variant="primary" icon={<CircleArrowUp size={14} />} onClick={() => void start(target)}>
              {t('docker.update.retry')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="docker-update">
        {phase === 'ready' ? (
          <p className="docker-update__intro">{t(target.kind === 'waha' ? 'docker.update.introWaha' : isContainer ? 'docker.update.introContainer' : 'docker.update.introImage', { image: target.image })}</p>
        ) : (
          <>
            <ol className="docker-update__steps" aria-label={t('docker.update.steps')}>
              {steps.map((name) => {
                const state = stepState(name)
                return (
                  <li key={name} className={`docker-update__step docker-update__step--${state}`}>
                    {state === 'active' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : state === 'done' ? <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} /> : state === 'failed' ? <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} /> : <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    <span>{t(`docker.update.step.${name}`)}</span>
                  </li>
                )
              })}
            </ol>

            <div className="docker-progress-terminal docker-update__log" ref={logRef} role="log" aria-live="polite" aria-label={t('docker.update.log')}>
              {lines.length === 0 ? <div className="docker-progress-line docker-progress-line--info">{t('docker.update.logWaiting')}</div> : null}
              {lines.map((line, i) => (
                <div key={i} className={`docker-progress-line docker-progress-line--${line.kind === 'error' ? 'error' : 'info'}`}>
                  {line.text}
                </div>
              ))}
            </div>

            {outcome ? (
              <div className="docker-update__outcome">
                <Badge tone={outcome.tone} dot>
                  {outcome.text}
                </Badge>
              </div>
            ) : null}
            {phase === 'failed' ? (
              <div className="docker-update__outcome">
                <Badge tone="danger" dot>
                  {t('docker.update.failed')}
                </Badge>
                {error ? <span className="docker-update__error">{error}</span> : null}
              </div>
            ) : null}
            {phase === 'cancelled' ? (
              <div className="docker-update__outcome">
                <Badge tone="warning" dot>
                  {t('docker.update.cancelled')}
                </Badge>
              </div>
            ) : null}

            <div className="docker-update__containers">
              <div className="docker-update__heading">{t('docker.update.containers')}</div>
              {containers.length === 0 ? (
                <p className="docker-update__empty">{t(phase === 'done' && !isContainer ? 'docker.update.noContainers' : 'docker.update.containersWaiting')}</p>
              ) : (
                containers.map((c) => (
                  <div key={c.name} className="docker-update__container">
                    <div className="docker-update__container-text">
                      <span className="docker-app-name" title={c.name}>{c.name}</span>
                      <span className="docker-row__sub">{c.status || c.image}</span>
                    </div>
                    <StatusPill state={c.state} />
                    {!isContainer && phase === 'done' && result?.changed && c.compose ? (
                      <Button type="button" size="sm" variant="outline" icon={<CircleArrowUp size={12} />} onClick={() => { startedFor.current = null; onApplyToContainer(c) }}>
                        {t('docker.update.apply')}
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

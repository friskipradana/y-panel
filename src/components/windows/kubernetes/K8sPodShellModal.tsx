import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { KubernetesWindowState } from './useKubernetesWindow'

function resolvePodShellUrl(clusterId: string, namespace: string, podName: string, container: string, shell: string) {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const normalizedBase = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ shell })
  if (container) params.set('container', container)
  return `${protocol}//${window.location.host}${normalizedBase}/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}/shell/ws?${params.toString()}`
}

export function K8sPodShellModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, activeClusterId, shellPod, setShellPod } = kw
  const [container, setContainer] = useState('')
  const [shellBin, setShellBin] = useState('/bin/sh')
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting')
  const [attempt, setAttempt] = useState(0)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setContainer(shellPod?.containers[0] ?? '')
    setShellBin('/bin/sh')
  }, [shellPod])

  useEffect(() => {
    if (!shellPod || !activeClusterId || !hostRef.current) return
    setStatus('connecting')
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()

    const ws = new WebSocket(resolvePodShellUrl(activeClusterId, shellPod.namespace, shellPod.name, container, shellBin))
    ws.onopen = () => {
      setStatus('connected')
      term.focus()
    }
    ws.onmessage = (ev) => {
      term.write(String(ev.data))
    }
    ws.onclose = () => {
      setStatus('closed')
    }
    ws.onerror = () => {
      setStatus('closed')
    }

    const disposeData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const onResize = () => {
      try {
        fit.fit()
      } catch {
        // ignore resize when dialog is transitioning
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      disposeData.dispose()
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close()
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
      term.dispose()
    }
  }, [activeClusterId, shellPod, container, shellBin, attempt])

  return (
    <Modal
      open={Boolean(shellPod)}
      onClose={() => setShellPod(null)}
      title={t('k8s.shell')}
      subtitle={shellPod ? `${shellPod.namespace}/${shellPod.name}` : undefined}
      size="sheet"
      width={1040}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status === 'connected' ? 'success' : status === 'connecting' ? 'info' : 'neutral'} dot>
            {t(`k8s.shellStatus.${status}`)}
          </Badge>
          {shellPod && shellPod.containers.length > 1 ? (
            <Select
              size="sm"
              value={container}
              onChange={setContainer}
              options={shellPod.containers.map((c) => ({ value: c, label: c }))}
            />
          ) : null}
          <Select
            size="sm"
            value={shellBin}
            onChange={setShellBin}
            options={[
              { value: '/bin/sh', label: '/bin/sh' },
              { value: '/bin/bash', label: '/bin/bash' },
            ]}
          />
          <Button
            variant="outline"
            icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('common.refresh')}
          </Button>
        </div>
        <div
          ref={hostRef}
          className="min-h-0 flex-1 w-full overflow-hidden rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-2"
        />
      </div>
    </Modal>
  )
}

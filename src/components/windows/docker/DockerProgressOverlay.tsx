import { useEffect, useRef, useState } from 'react'
import { Boxes } from 'lucide-react'

export function DockerProgressOverlay({
  title,
  subtitle,
  type,
}: {
  title: string
  subtitle: string
  type: 'deploy' | 'pull'
}) {
  const [logs, setLogs] = useState<string[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const lines: string[] = []
    const addLog = (text: string, styleType?: 'system' | 'success' | 'info') => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false })
      const formatted = `[${time}] ${text}`
      if (styleType === 'system') {
        lines.push(`SYSTEM::${formatted}`)
      } else if (styleType === 'success') {
        lines.push(`SUCCESS::${formatted}`)
      } else {
        lines.push(`INFO::${formatted}`)
      }
      setLogs([...lines])
    }

    addLog('Connecting to Docker daemon...', 'system')

    let timer1: NodeJS.Timeout
    let timer2: NodeJS.Timeout
    let timer3: NodeJS.Timeout
    let timer4: NodeJS.Timeout
    let timer5: NodeJS.Timeout

    if (type === 'pull') {
      timer1 = setTimeout(() => addLog(`Requesting image '${subtitle}' from registry...`), 800)
      timer2 = setTimeout(() => addLog('Resolving tag digest & manifest schema v2...'), 1800)
      timer3 = setTimeout(() => addLog('Downloading image layers...', 'info'), 2800)
      timer4 = setTimeout(() => addLog('Layer 1: Downloading [=================>] 100%', 'info'), 4000)
      timer5 = setTimeout(() => addLog('Layer 2: Extracting filesystem layers...', 'info'), 5200)
    } else {
      timer1 = setTimeout(() => addLog('Preparing compose configuration directory...'), 800)
      timer2 = setTimeout(() => addLog('Validating port bindings & resource limits...', 'info'), 1600)
      timer3 = setTimeout(() => addLog('Executing: docker compose up -d...', 'system'), 2400)
      timer4 = setTimeout(() => addLog('Creating network default_bridge - Created', 'success'), 3400)
      timer5 = setTimeout(() => addLog(`Starting container '${subtitle}'...`, 'info'), 4400)
    }

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
      clearTimeout(timer5)
    }
  }, [type, subtitle])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="docker-progress-overlay">
      <div className="docker-progress-container">
        <div className="docker-progress-spinner-wrap">
          <div className="docker-progress-spinner" />
          <Boxes className="docker-progress-icon h-7 w-7" />
        </div>
        <h3 className="docker-progress-title">{title}</h3>
        <div className="docker-progress-subtitle">{subtitle}</div>

        <div className="docker-progress-terminal" ref={terminalRef}>
          {logs.map((line, idx) => {
            let className = 'docker-progress-line'
            let content = line
            if (line.startsWith('SYSTEM::')) {
              className += ' docker-progress-line--system'
              content = line.replace('SYSTEM::', '')
            } else if (line.startsWith('SUCCESS::')) {
              className += ' docker-progress-line--success'
              content = line.replace('SUCCESS::', '')
            } else if (line.startsWith('INFO::')) {
              className += ' docker-progress-line--info'
              content = line.replace('INFO::', '')
            }
            return (
              <div key={idx} className={className}>
                {content}
              </div>
            )
          })}
          <div className="docker-progress-line docker-progress-line--blink">
            {logs.length > 0 ? '' : 'Starting...'}
          </div>
        </div>
      </div>
    </div>
  )
}

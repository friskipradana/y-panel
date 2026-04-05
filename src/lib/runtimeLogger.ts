type LogLevel = 'info' | 'warn' | 'error'

function emit(level: LogLevel, scope: string, message: string, payload?: unknown) {
  const stamp = new Date().toISOString()
  const prefix = `[ui-panel][frontend][${scope}] ${stamp} ${message}`

  if (level === 'error') {
    console.error(prefix, payload ?? '')
    return
  }

  if (level === 'warn') {
    console.warn(prefix, payload ?? '')
    return
  }

  console.info(prefix, payload ?? '')
}

export const runtimeLogger = {
  info(scope: string, message: string, payload?: unknown) {
    emit('info', scope, message, payload)
  },
  warn(scope: string, message: string, payload?: unknown) {
    emit('warn', scope, message, payload)
  },
  error(scope: string, message: string, payload?: unknown) {
    emit('error', scope, message, payload)
  },
}

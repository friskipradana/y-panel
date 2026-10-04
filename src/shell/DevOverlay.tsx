import { Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { lazyNamed } from '@/lib/lazy'
import { HOME_PATH } from '@/router'

const SHOW_DEBUG_OVERLAY =
  import.meta.env.DEV && import.meta.env.VITE_SHOW_DEBUG_OVERLAY === 'true'

const DebugPanel = SHOW_DEBUG_OVERLAY
  ? lazyNamed(() => import('@/components/debug/DebugPanel'), 'DebugPanel')
  : null
const DebugGrid = SHOW_DEBUG_OVERLAY
  ? lazyNamed(() => import('@/components/debug/DebugGrid'), 'DebugGrid')
  : null

interface DevOverlayProps {
  authenticated: boolean
}

export function DevOverlay({ authenticated }: DevOverlayProps) {
  const location = useLocation()

  if (!SHOW_DEBUG_OVERLAY || !DebugPanel || !DebugGrid || !authenticated || location.pathname !== HOME_PATH) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <DebugPanel />
      <DebugGrid />
    </Suspense>
  )
}

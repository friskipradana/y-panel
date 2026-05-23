import { useState } from 'react'
import { useWindowStore, selectFocusedId } from '@/store/windowStore'
import { useI18n } from '@/lib/i18n'

export function DebugPanel() {
  const { windows } = useWindowStore()
  const focusedId = useWindowStore(selectFocusedId)
  const { t } = useI18n()
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [sortReversed, setSortReversed] = useState(true)

  const minimapW = 300
  const minimapH = 200
  const scaleX = minimapW / (typeof window !== 'undefined' ? window.innerWidth : 1920)
  const scaleY = minimapH / (typeof window !== 'undefined' ? window.innerHeight : 1080)

  return (
    <>
      {/* ✅ BUTTONS - Fixed di pojok kanan bawah */}
      <div style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 100000, // ✅ lebih tinggi dari panel
        display: 'flex',
        gap: 6,
      }}>
        {/* Arrow sort (hanya saat table view) */}
        {view === 'table' && (
          <button
            onClick={() => setSortReversed(!sortReversed)}
            style={{
              width: 32,
              height: 32,
              background: 'var(--debug-panel-bg)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--debug-panel-button-border)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: 'var(--debug-panel-focus)',
              cursor: 'pointer',
              boxShadow: 'var(--debug-panel-button-shadow)',
            }}
          >
            {sortReversed ? '↓' : '↑'}
          </button>
        )}
        
        {/* View toggle */}
        <button
          onClick={() => setView(view === 'table' ? 'grid' : 'table')}
          style={{
            width: 32,
            height: 32,
            background: 'var(--debug-panel-bg)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--debug-panel-button-border)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: 'var(--debug-panel-focus)',
            cursor: 'pointer',
            boxShadow: 'var(--debug-panel-button-shadow)',
          }}
        >
          {view === 'table' ? '🗺️' : '📋'}
        </button>
      </div>

      {/* ✅ DEBUG PANEL - Adjust posisi agar tidak tertutup buttons */}
      <div style={{
        position: 'fixed',
        bottom: 52, // ✅ 12px + 32px button + 8px gap
        right: 12,
        zIndex: 99999,
        background: 'var(--debug-panel-bg)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--debug-panel-border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontFamily: 'monospace',
        fontSize: 11,
        color: 'var(--debug-panel-text)',
        minWidth: view === 'grid' ? minimapW + 28 : 320,
        maxHeight: 400,
        overflowY: 'auto',
      }}>
        {/* Header - HAPUS BUTTONS DARI SINI */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--debug-panel-border)' }}>
          <span style={{ color: 'var(--debug-panel-focus)', fontWeight: 700 }}>🧠 DEBUG PANEL</span>
          <span style={{ color: 'var(--debug-panel-muted)', fontSize: 10 }}>
            {t('debug.focused')}: <span style={{ color: 'var(--debug-panel-focus)' }}>{focusedId || t('debug.none')}</span>
          </span>
        </div>

        {/* TABLE VIEW */}
        {view === 'table' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 45px 45px 45px 45px 45px 70px', gap: 4, marginBottom: 4, color: 'var(--debug-panel-muted)', fontSize: 10 }}>
              <span>ID</span>
              <span>X</span>
              <span>Y</span>
              <span>W</span>
              <span>H</span>
              <span>Z</span>
              <span>{t('debug.status')}</span>
            </div>

            {windows.length === 0 && (
              <div style={{ color: 'var(--debug-panel-empty)', textAlign: 'center', padding: '8px 0' }}>{t('debug.noWindowsOpen')}</div>
            )}
            {(sortReversed ? [...windows].reverse() : windows).map(w => (
              <div key={w.id} style={{
                display: 'grid',
                gridTemplateColumns: '80px 45px 45px 45px 45px 45px 70px',
                gap: 4,
                padding: '3px 0',
                borderBottom: '1px solid var(--debug-panel-row-border)',
                background: w.id === focusedId ? 'var(--debug-panel-row-focus-bg)' : 'transparent',
                color: 'var(--debug-panel-text)',
                borderRadius: 4,
              }}>
                <span style={{ 
                  color: w.id === focusedId ? 'var(--debug-panel-focus)' : 'var(--debug-panel-normal)',
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  fontWeight: w.id === focusedId ? 600 : 400,
                }}>
                  {w.id === focusedId && '▸ '}{w.id}
                </span>
                <span style={{ color: 'var(--debug-panel-warning)' }}>{Math.round(w.x)}</span>
                <span style={{ color: 'var(--debug-panel-warning)' }}>{Math.round(w.y)}</span>
                <span>{Math.round(w.width)}</span>
                <span>{Math.round(w.height)}</span>
                <span style={{ color: w.id === focusedId ? 'var(--debug-panel-focus)' : 'var(--debug-panel-success)' }}>{w.zIndex}</span>
                <span style={{ color: w.isMinimized ? 'var(--debug-panel-danger)' : w.isMaximized ? 'var(--debug-panel-focus)' : 'var(--debug-panel-success)' }}>
                  {w.isMinimized ? t('debug.minimized') : w.isMaximized ? t('debug.maximized') : t('debug.normal')}
                </span>
              </div>
            ))}

            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--debug-panel-border)', color: 'var(--debug-panel-muted)', fontSize: 10 }}>
              {t('debug.viewport')}: {typeof window !== 'undefined' ? `${window.innerWidth} x ${window.innerHeight}` : '-'}
              {' '}| {t('debug.center')}: {typeof window !== 'undefined' ? `${Math.round(window.innerWidth / 2)}, ${Math.round(window.innerHeight / 2)}` : '-'}
            </div>
          </>
        )}

        {/* GRID VIEW */}
        {view === 'grid' && (
          <div style={{ position: 'relative' }}>
            <div style={{
              width: minimapW,
              height: minimapH,
              background: 'var(--debug-panel-minimap-bg)',
              border: '1px solid var(--debug-panel-grid-border)',
              borderRadius: 4,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.15 }}>
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--debug-panel-minimap-grid)" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {[...windows].reverse().map(w => {
                if (w.isMinimized) return null
                const isFocused = w.id === focusedId
                return (
                  <div
                    key={w.id}
                    title={`${w.id} | ${Math.round(w.x)},${Math.round(w.y)} | ${Math.round(w.width)}x${Math.round(w.height)}`}
                    style={{
                      position: 'absolute',
                      left: w.x * scaleX,
                      top: w.y * scaleY,
                      width: w.width * scaleX,
                      height: w.height * scaleY,
                      background: isFocused ? 'var(--debug-panel-minimap-focus-bg)' : 'var(--debug-panel-minimap-normal-bg)',
                      border: `1px solid ${isFocused ? 'var(--debug-panel-focus)' : 'var(--debug-panel-normal)'}`,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      color: isFocused ? 'var(--debug-panel-focus)' : 'var(--debug-panel-normal)',
                      fontWeight: 600,
                    }}
                  >
                    {w.icon}
                  </div>
                )
              })}

              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 8,
                height: 8,
                transform: 'translate(-50%, -50%)',
                border: '1px solid var(--debug-panel-danger)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }} />
            </div>

            <div style={{ marginTop: 8, fontSize: 9, color: 'var(--debug-panel-muted)', display: 'flex', gap: 12 }}>
              <span>🟣 {t('debug.focused')}</span>
              <span>🔵 {t('debug.normal')}</span>
              <span>🔴 {t('debug.center')}</span>
            </div>

            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--debug-panel-border)', color: 'var(--debug-panel-muted)', fontSize: 10 }}>
              viewport: {typeof window !== 'undefined' ? `${window.innerWidth} x ${window.innerHeight}` : '-'}
              {' '}| {t('debug.visible')}: {windows.filter(w => !w.isMinimized).length}/{windows.length}
            </div>
          </div>
        )}
      </div>
    </>
  )
}




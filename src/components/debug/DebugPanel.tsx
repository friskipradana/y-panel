import { useState } from 'react'
import { useWindowStore, selectFocusedId } from '@/store/windowStore'

export function DebugPanel() {
  const { windows } = useWindowStore()
  const focusedId = useWindowStore(selectFocusedId)
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
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(167, 139, 250, 0.3)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: '#a78bfa',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
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
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(167, 139, 250, 0.3)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: '#a78bfa',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
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
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '10px 14px',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#e5e5e5',
        minWidth: view === 'grid' ? minimapW + 28 : 320,
        maxHeight: 400,
        overflowY: 'auto',
      }}>
        {/* Header - HAPUS BUTTONS DARI SINI */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>🧠 DEBUG PANEL</span>
          <span style={{ color: '#6b7280', fontSize: 10 }}>
            focused: <span style={{ color: '#a78bfa' }}>{focusedId || 'none'}</span>
          </span>
        </div>

        {/* TABLE VIEW */}
        {view === 'table' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 45px 45px 45px 45px 45px 70px', gap: 4, marginBottom: 4, color: '#6b7280', fontSize: 10 }}>
              <span>ID</span>
              <span>X</span>
              <span>Y</span>
              <span>W</span>
              <span>H</span>
              <span>Z</span>
              <span>STATUS</span>
            </div>

            {windows.length === 0 && (
              <div style={{ color: '#4b5563', textAlign: 'center', padding: '8px 0' }}>no windows open</div>
            )}
            {(sortReversed ? [...windows].reverse() : windows).map(w => (
              <div key={w.id} style={{
                display: 'grid',
                gridTemplateColumns: '80px 45px 45px 45px 45px 45px 70px',
                gap: 4,
                padding: '3px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: w.id === focusedId ? 'rgba(167, 139, 250, 0.1)' : 'transparent',
                color: '#e5e5e5',
                borderRadius: 4,
              }}>
                <span style={{ 
                  color: w.id === focusedId ? '#a78bfa' : '#60a5fa',
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  fontWeight: w.id === focusedId ? 600 : 400,
                }}>
                  {w.id === focusedId && '▸ '}{w.id}
                </span>
                <span style={{ color: '#fbbf24' }}>{Math.round(w.x)}</span>
                <span style={{ color: '#fbbf24' }}>{Math.round(w.y)}</span>
                <span>{Math.round(w.width)}</span>
                <span>{Math.round(w.height)}</span>
                <span style={{ color: w.id === focusedId ? '#a78bfa' : '#34d399' }}>{w.zIndex}</span>
                <span style={{ color: w.isMinimized ? '#ef4444' : w.isMaximized ? '#a78bfa' : '#34d399' }}>
                  {w.isMinimized ? 'minimized' : w.isMaximized ? 'maximized' : 'normal'}
                </span>
              </div>
            ))}

            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', fontSize: 10 }}>
              viewport: {typeof window !== 'undefined' ? `${window.innerWidth} x ${window.innerHeight}` : '-'}
              {' '}| center: {typeof window !== 'undefined' ? `${Math.round(window.innerWidth / 2)}, ${Math.round(window.innerHeight / 2)}` : '-'}
            </div>
          </>
        )}

        {/* GRID VIEW */}
        {view === 'grid' && (
          <div style={{ position: 'relative' }}>
            <div style={{
              width: minimapW,
              height: minimapH,
              background: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.15 }}>
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#666" strokeWidth="0.5"/>
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
                      background: isFocused ? 'rgba(167, 139, 250, 0.3)' : 'rgba(96, 165, 250, 0.2)',
                      border: `1px solid ${isFocused ? '#a78bfa' : '#60a5fa'}`,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      color: isFocused ? '#a78bfa' : '#60a5fa',
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
                border: '1px solid #ef4444',
                borderRadius: '50%',
                pointerEvents: 'none',
              }} />
            </div>

            <div style={{ marginTop: 8, fontSize: 9, color: '#6b7280', display: 'flex', gap: 12 }}>
              <span>🟣 focused</span>
              <span>🔵 normal</span>
              <span>🔴 center</span>
            </div>

            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', fontSize: 10 }}>
              viewport: {typeof window !== 'undefined' ? `${window.innerWidth} x ${window.innerHeight}` : '-'}
              {' '}| visible: {windows.filter(w => !w.isMinimized).length}/{windows.length}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
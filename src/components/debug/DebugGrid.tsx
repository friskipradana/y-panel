import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'

type GridType = 'column' | 'row' | 'full'

interface GridSettings {
  columns: number
  rows: number
  gutter: number
  opacity: number
  color: string
  showMeasurements: boolean
}

export function DebugGrid() {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState(false)
  const [gridType, setGridType] = useState<GridType>('column')
  const [showInfo, setShowInfo] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<GridSettings>({
    columns: 12,
    rows: 12,
    gutter: 16,
    opacity: 0.3,
    color: '#00ffff',
    showMeasurements: true,
  })

  // Screen info
  const [screenInfo, setScreenInfo] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  })

  // Update screen info on resize
  useEffect(() => {
    const updateScreenInfo = () => {
      setScreenInfo({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      })
    }

    window.addEventListener('resize', updateScreenInfo)
    return () => window.removeEventListener('resize', updateScreenInfo)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+G - Toggle grid on/off
      if (e.ctrlKey && !e.shiftKey && e.key === 'g') {
        e.preventDefault()
        setEnabled(prev => !prev)
      }

      // Ctrl+Shift+G - Cycle grid type
      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        if (!enabled) setEnabled(true) // Auto-enable
        setGridType(prev => {
          if (prev === 'column') return 'row'
          if (prev === 'row') return 'full'
          return 'column'
        })
      }

      // Ctrl+I - Toggle info panel
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault()
        setShowInfo(prev => !prev)
      }

      // Ctrl+, - Toggle settings panel
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setShowSettings(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])

  // Calculate grid metrics
  const columnWidth = (screenInfo.width - (settings.gutter * 2 * settings.columns)) / settings.columns
  const rowHeight = (screenInfo.height - (settings.gutter * 2 * settings.rows)) / settings.rows

  // Parse color to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return (
    <>
      {/* Grid Overlay */}
      {enabled && <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 99998,
      }}>
        {/* Column Grid */}
        {gridType === 'column' && (
          <div style={{
            display: 'flex',
            width: '100%',
            height: '100%',
          }}>
            {Array.from({ length: settings.columns }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderLeft: i === 0 ? `2px solid ${hexToRgba(settings.color, settings.opacity + 0.2)}` : `1px solid ${hexToRgba(settings.color, settings.opacity)}`,
                  borderRight: i === settings.columns - 1 ? `2px solid ${hexToRgba(settings.color, settings.opacity + 0.2)}` : `1px solid ${hexToRgba(settings.color, settings.opacity)}`,
                  background: hexToRgba(settings.color, settings.opacity * 0.15),
                  margin: `0 ${settings.gutter}px`,
                  position: 'relative',
                }}
              >
                {settings.showMeasurements && (
                  <>
                    {/* Top measurement */}
                    <div style={{
                      position: 'absolute',
                      top: 4,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: settings.color,
                      background: 'rgba(0, 0, 0, 0.7)',
                      padding: '2px 4px',
                      borderRadius: 2,
                      whiteSpace: 'nowrap',
                    }}>
                      {Math.round(columnWidth)}px
                    </div>
                    {/* Column number */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 24,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: hexToRgba(settings.color, 0.15),
                    }}>
                      {i + 1}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Row Grid */}
        {gridType === 'row' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
          }}>
            {Array.from({ length: settings.rows }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderTop: i === 0 ? `2px solid ${hexToRgba(settings.color, settings.opacity + 0.2)}` : `1px solid ${hexToRgba(settings.color, settings.opacity)}`,
                  borderBottom: i === settings.rows - 1 ? `2px solid ${hexToRgba(settings.color, settings.opacity + 0.2)}` : `1px solid ${hexToRgba(settings.color, settings.opacity)}`,
                  background: hexToRgba(settings.color, settings.opacity * 0.15),
                  margin: `${settings.gutter}px 0`,
                  position: 'relative',
                }}
              >
                {settings.showMeasurements && (
                  <>
                    {/* Left measurement */}
                    <div style={{
                      position: 'absolute',
                      left: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: settings.color,
                      background: 'rgba(0, 0, 0, 0.7)',
                      padding: '2px 4px',
                      borderRadius: 2,
                      whiteSpace: 'nowrap',
                    }}>
                      {Math.round(rowHeight)}px
                    </div>
                    {/* Row number */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 24,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: hexToRgba(settings.color, 0.15),
                    }}>
                      {i + 1}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Full Grid */}
        {gridType === 'full' && (
          <div style={{
            width: '100%',
            height: '100%',
            backgroundImage: `
              repeating-linear-gradient(0deg, 
                transparent, 
                transparent calc(100% / ${settings.rows} - 1px), 
                ${hexToRgba(settings.color, settings.opacity)} calc(100% / ${settings.rows} - 1px), 
                ${hexToRgba(settings.color, settings.opacity)} calc(100% / ${settings.rows})
              ),
              repeating-linear-gradient(90deg, 
                transparent, 
                transparent calc(100% / ${settings.columns} - 1px), 
                ${hexToRgba(settings.color, settings.opacity)} calc(100% / ${settings.columns} - 1px), 
                ${hexToRgba(settings.color, settings.opacity)} calc(100% / ${settings.columns})
              )
            `,
          }} />
        )}
      </div>}

      {/* Info Panel */}
      {showInfo && enabled && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${hexToRgba(settings.color, 0.5)}`,
          borderRadius: 8,
          padding: '12px 16px',
          color: settings.color,
          fontSize: 11,
          fontFamily: 'monospace',
          zIndex: 99999,
          boxShadow: `0 4px 20px ${hexToRgba(settings.color, 0.2)}`,
          pointerEvents: 'auto',
          minWidth: 200,
        }}>
          {/* Grid Status */}
          <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${hexToRgba(settings.color, 0.2)}` }}>
            <div style={{ color: '#888', fontSize: 9, marginBottom: 4 }}>{t('debug.gridStatus')}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.type')}:</span>
              <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{gridType}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>{t('debug.state')}:</span>
              <span style={{ fontWeight: 700 }}>ON</span>
            </div>
          </div>

          {/* Screen Info */}
          <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${hexToRgba(settings.color, 0.2)}` }}>
            <div style={{ color: '#888', fontSize: 9, marginBottom: 4 }}>{t('debug.screenInfo')}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.viewport')}:</span>
              <span>{screenInfo.width}×{screenInfo.height}px</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.ratio')}:</span>
              <span>{(screenInfo.width / screenInfo.height).toFixed(2)}:1</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.dpr')}:</span>
              <span>{screenInfo.dpr}x</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>{t('debug.center')}:</span>
              <span>{Math.round(screenInfo.width / 2)}, {Math.round(screenInfo.height / 2)}</span>
            </div>
          </div>

          {/* Grid Metrics */}
          <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${hexToRgba(settings.color, 0.2)}` }}>
            <div style={{ color: '#888', fontSize: 9, marginBottom: 4 }}>{t('debug.gridMetrics')}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.columns')}:</span>
              <span>{settings.columns}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.rows')}:</span>
              <span>{settings.rows}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.gutter')}:</span>
              <span>{settings.gutter}px</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#888' }}>{t('debug.colWidth')}:</span>
              <span>{Math.round(columnWidth)}px</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>{t('debug.rowHeight')}:</span>
              <span>{Math.round(rowHeight)}px</span>
            </div>
          </div>

          {/* Shortcuts */}
          <div style={{ 
            fontSize: 9,
            color: '#666',
            lineHeight: 1.4,
          }}>
            <div>Ctrl+G → toggle</div>
            <div>Ctrl+Shift+G → cycle</div>
            <div>Ctrl+I → info</div>
            <div>Ctrl+, → settings</div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: 20,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${hexToRgba(settings.color, 0.5)}`,
          borderRadius: 8,
          padding: '12px 16px',
          color: settings.color,
          fontSize: 11,
          fontFamily: 'monospace',
          zIndex: 99999,
          boxShadow: `0 4px 20px ${hexToRgba(settings.color, 0.2)}`,
          pointerEvents: 'auto',
          minWidth: 240,
        }}>
          <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${hexToRgba(settings.color, 0.2)}`, fontWeight: 700 }}>
            ⚙️ {t('debug.gridSettings')}
          </div>

          {/* Columns */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>{t('debug.columns')}</span>
              <span>{settings.columns}</span>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              value={settings.columns}
              onChange={(e) => setSettings({ ...settings, columns: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: settings.color }}
            />
          </div>

          {/* Rows */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>{t('debug.rows')}</span>
              <span>{settings.rows}</span>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              value={settings.rows}
              onChange={(e) => setSettings({ ...settings, rows: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: settings.color }}
            />
          </div>

          {/* Gutter */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>{t('debug.gutter')}</span>
              <span>{settings.gutter}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              value={settings.gutter}
              onChange={(e) => setSettings({ ...settings, gutter: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: settings.color }}
            />
          </div>

          {/* Opacity */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>{t('debug.opacity')}</span>
              <span>{Math.round(settings.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={settings.opacity}
              onChange={(e) => setSettings({ ...settings, opacity: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: settings.color }}
            />
          </div>

          {/* Color Presets */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: '#888', marginBottom: 6 }}>{t('debug.color')}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#00ffff', '#ff00ff', '#00ff00', '#ff0000', '#ffff00', '#ffffff'].map(color => (
                <button
                  key={color}
                  onClick={() => setSettings({ ...settings, color })}
                  style={{
                    width: 24,
                    height: 24,
                    background: color,
                    border: settings.color === color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    boxShadow: settings.color === color ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Measurements Toggle */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showMeasurements}
                onChange={(e) => setSettings({ ...settings, showMeasurements: e.target.checked })}
                style={{ accentColor: settings.color }}
              />
              <span style={{ color: '#888' }}>{t('debug.showMeasurements')}</span>
            </label>
          </div>

          {/* Presets */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${hexToRgba(settings.color, 0.2)}` }}>
            <div style={{ color: '#888', marginBottom: 6, fontSize: 9 }}>{t('debug.presets')}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSettings({ ...settings, columns: 12, rows: 12, gutter: 16 })}
                style={{
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${hexToRgba(settings.color, 0.3)}`,
                  borderRadius: 4,
                  color: settings.color,
                  fontSize: 9,
                  cursor: 'pointer',
                }}
              >
                12-col
              </button>
              <button
                onClick={() => setSettings({ ...settings, columns: 16, rows: 9, gutter: 8 })}
                style={{
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${hexToRgba(settings.color, 0.3)}`,
                  borderRadius: 4,
                  color: settings.color,
                  fontSize: 9,
                  cursor: 'pointer',
                }}
              >
                16:9
              </button>
              <button
                onClick={() => setSettings({ ...settings, columns: 8, rows: 8, gutter: 20 })}
                style={{
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${hexToRgba(settings.color, 0.3)}`,
                  borderRadius: 4,
                  color: settings.color,
                  fontSize: 9,
                  cursor: 'pointer',
                }}
              >
                8×8
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 9, color: '#666' }}>
            {t('debug.ctrlClose')}
          </div>
        </div>
      )}

      {/* Toggle Button - Always visible */}
      <button
        onClick={() => setEnabled(prev => !prev)}
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          width: 32,
          height: 32,
          background: enabled 
            ? hexToRgba(settings.color, 0.2)
            : 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          border: enabled 
            ? `1px solid ${hexToRgba(settings.color, 0.8)}` 
            : `1px solid ${hexToRgba(settings.color, 0.3)}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          color: enabled ? settings.color : '#4a5568',
          cursor: 'pointer',
          zIndex: 100000,
          boxShadow: enabled 
            ? `0 4px 12px ${hexToRgba(settings.color, 0.4)}, 0 0 20px ${hexToRgba(settings.color, 0.2)}` 
            : '0 4px 12px rgba(0, 0, 0, 0.3)',
          pointerEvents: 'auto',
          transition: 'all 0.2s ease',
        }}
        title={enabled ? t('debug.gridOnTitle') : t('debug.gridOffTitle')}
      >
        ⊞
      </button>

      {/* Settings Button */}
      <button
        onClick={() => setShowSettings(prev => !prev)}
        style={{
          position: 'fixed',
          bottom: 12,
          left: 52,
          width: 32,
          height: 32,
          background: showSettings 
            ? hexToRgba(settings.color, 0.2)
            : 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          border: showSettings 
            ? `1px solid ${hexToRgba(settings.color, 0.8)}` 
            : `1px solid ${hexToRgba(settings.color, 0.3)}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          color: showSettings ? settings.color : '#4a5568',
          cursor: 'pointer',
          zIndex: 100000,
          boxShadow: showSettings 
            ? `0 4px 12px ${hexToRgba(settings.color, 0.4)}` 
            : '0 4px 12px rgba(0, 0, 0, 0.3)',
          pointerEvents: 'auto',
          transition: 'all 0.2s ease',
        }}
        title={t('debug.settingsTitle')}
      >
        ⚙
      </button>
    </>
  )
}




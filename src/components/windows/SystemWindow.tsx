const INFO_ROWS = [
  ['Hostname',  'myserver.local'],
  ['OS',        'Ubuntu 22.04 LTS'],
  ['Docker',    'v24.0.7'],
  ['Tunnel',    '✓ Connected'],
  ['SSL',       '✓ Active (Cloudflare)'],
  ['Domain',    'yourdomain.com'],
  ['Uptime',    '12 days, 4h'],
]

export function SystemWindow() {
  return (
    <div>
      <div className="flex flex-col">
        {INFO_ROWS.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between py-2 text-sm"
            style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}
          >
            <span style={{ color: 'var(--sand-400)' }}>{k}</span>
            <span className="font-medium" style={{ color: 'var(--sand-600)' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

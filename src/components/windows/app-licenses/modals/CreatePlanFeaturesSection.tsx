import { CREATE_PLAN_FEATURE_TOGGLES, type LicenseFeatureState } from './featureQuotas'

interface CreatePlanFeaturesSectionProps {
  value: LicenseFeatureState
  onChange: <K extends keyof LicenseFeatureState>(key: K, val: LicenseFeatureState[K]) => void
}

export function CreatePlanFeaturesSection({ value, onChange }: CreatePlanFeaturesSectionProps) {
  return (
    <div>
      <label className="block font-semibold text-[var(--win-text)] mb-1.5">
        Fitur &amp; Kuota dalam Paket:
      </label>
      <div className="space-y-3 p-3 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Maks. Kontak (0 = Tanpa Batas)
            </label>
            <input
              type="number"
              min={0}
              value={value.maxContacts}
              onChange={(e) => onChange('maxContacts', Number(e.target.value))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Kuota Sesi WA (Multi-Sesi)
            </label>
            <input
              type="number"
              min={1}
              value={value.maxSessions}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value))
                onChange('maxSessions', v)
                if (v > 1) onChange('multiSession', true)
              }}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Batas Ganti Nomor / Sesi (x kali)
            </label>
            <input
              type="number"
              min={1}
              value={value.maxSessionIdentitySwitches}
              onChange={(e) => onChange('maxSessionIdentitySwitches', Math.max(1, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Kuota Broadcast / Bulan
            </label>
            <input
              type="number"
              min={0}
              disabled={value.unlimitedBroadcast}
              value={value.unlimitedBroadcast ? 0 : value.maxBroadcastPerMonth}
              onChange={(e) => onChange('maxBroadcastPerMonth', Number(e.target.value))}
              className="panel-input panel-input--mono w-full text-xs disabled:opacity-50"
              placeholder={value.unlimitedBroadcast ? 'Tanpa Batas' : '500'}
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Kuota Template (0 = Tanpa Batas)
            </label>
            <input
              type="number"
              min={0}
              value={value.maxTemplates}
              onChange={(e) => onChange('maxTemplates', Number(e.target.value))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Maks. User / Agent
            </label>
            <input
              type="number"
              min={1}
              value={value.maxUsers}
              onChange={(e) => onChange('maxUsers', Math.max(1, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Kuota Akun Kanal (0 = Unlimited)
            </label>
            <input
              type="number"
              min={0}
              value={value.maxChannels}
              onChange={(e) => onChange('maxChannels', Math.max(0, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              Prioritas Support
            </label>
            <select
              value={value.supportPriority}
              onChange={(e) => onChange('supportPriority', e.target.value)}
              className="panel-input w-full text-xs"
            >
              <option value="standard">Standard</option>
              <option value="fast">Fast</option>
              <option value="priority">Priority</option>
              <option value="vip">VIP</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--win-border)]">
          {CREATE_PLAN_FEATURE_TOGGLES.map((item) => (
            <label key={item.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value[item.key]}
                onChange={(e) => onChange(item.key, e.target.checked)}
                className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

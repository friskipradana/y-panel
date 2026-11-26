import { KeyRound } from 'lucide-react'
import { EDIT_FEATURE_TOGGLES, type LicenseFeatureState } from './featureQuotas'

interface FeatureFlagsQuotasSectionProps {
  title: string
  value: LicenseFeatureState
  onChange: <K extends keyof LicenseFeatureState>(key: K, val: LicenseFeatureState[K]) => void
  showIdentitySwitches?: boolean
  showStorageLimits?: boolean
}

export function FeatureFlagsQuotasSection({
  title,
  value,
  onChange,
  showIdentitySwitches = false,
  showStorageLimits = false,
}: FeatureFlagsQuotasSectionProps) {
  return (
    <div className="pt-2 border-t border-[var(--win-border)] space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--win-text)]">
        <KeyRound size={14} className="text-[var(--panel-primary-text)]" />
        <span>{title}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {EDIT_FEATURE_TOGGLES.map((item) => (
          <label
            key={item.key}
            className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]"
          >
            <input
              type="checkbox"
              checked={value[item.key]}
              onChange={(e) => onChange(item.key, e.target.checked)}
              className="rounded border-[var(--win-border)]"
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
            Maks. Kontak <span className="text-[11px] font-normal text-[var(--text-secondary)]">(0 = Tanpa Batas)</span>
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
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
            Kuota Sesi WA <span className="text-[11px] font-normal text-[var(--text-secondary)]">(Multi-Sesi)</span>
          </label>
          <input
            type="number"
            min={1}
            value={value.maxSessions}
            onChange={(e) => {
              const val = Math.max(1, Number(e.target.value))
              onChange('maxSessions', val)
              if (val > 1) onChange('multiSession', true)
            }}
            className="panel-input panel-input--mono w-full text-xs"
          />
        </div>

        {showIdentitySwitches && (
          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Batas Ganti Nomor / Sesi <span className="text-[11px] font-normal text-[var(--text-secondary)]">(x kali)</span>
            </label>
            <input
              type="number"
              min={1}
              value={value.maxSessionIdentitySwitches}
              onChange={(e) => onChange('maxSessionIdentitySwitches', Math.max(1, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
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
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
            Kuota Template <span className="text-[11px] font-normal text-[var(--text-secondary)]">(0 = Tanpa Batas)</span>
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
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
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
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
            Kuota Akun Kanal <span className="text-[11px] font-normal text-[var(--text-secondary)]">(0 = Unlimited)</span>
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
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
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

        {showStorageLimits && (
          <>
            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Kapasitas Penyimpanan Media (MB) <span className="text-[11px] font-normal text-[var(--text-secondary)]">(5120 = 5 GB)</span>
              </label>
              <input
                type="number"
                min={100}
                value={value.maxStorageMb}
                onChange={(e) => onChange('maxStorageMb', Math.max(100, Number(e.target.value)))}
                className="panel-input panel-input--mono w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Maks. Ukuran Berkas / Dokumen (MB)
              </label>
              <input
                type="number"
                min={1}
                value={value.maxAttachmentSizeMb}
                onChange={(e) => onChange('maxAttachmentSizeMb', Math.max(1, Number(e.target.value)))}
                className="panel-input panel-input--mono w-full text-xs"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

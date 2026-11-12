import type RFB from '@novnc/novnc'
import { createKvmToken, type KvmQualityMode } from '@/api/kvm'

interface RfbWithQuality extends RFB {
  qualityLevel: number
  compressionLevel: number
}

export function applyRfbQualityPreset(rfb: RFB, mode: KvmQualityMode): void {
  const preset = KVM_QUALITY_PRESETS[mode]
  const target = rfb as RfbWithQuality
  target.qualityLevel = preset.qualityLevel
  target.compressionLevel = preset.compressionLevel
}

export interface KvmQualityPreset {
  mode: KvmQualityMode
  qualityLevel: number
  compressionLevel: number
  labelKey: 'kvm.modeFast' | 'kvm.modeBestPerformance' | 'kvm.modeBestQuality'
}

export const KVM_QUALITY_PRESETS: Record<KvmQualityMode, KvmQualityPreset> = {
  balanced: {
    mode: 'balanced',
    qualityLevel: 5,
    compressionLevel: 4,
    labelKey: 'kvm.modeBestPerformance',
  },
  quality: {
    mode: 'quality',
    qualityLevel: 9,
    compressionLevel: 1,
    labelKey: 'kvm.modeBestQuality',
  },
  fast: {
    mode: 'fast',
    qualityLevel: 2,
    compressionLevel: 1,
    labelKey: 'kvm.modeFast',
  },
}

export const KVM_QUALITY_STORAGE_KEY = 'reneo.kvm.qualityMode'

export const KVM_RESOLUTION_VALUES = [
  '1024x768',
  '1280x720',
  '1280x800',
  '1366x768',
  '1600x900',
  '1920x1080',
] as const

export function readStoredKvmQualityMode(): KvmQualityMode {
  try {
    const raw = window.localStorage.getItem(KVM_QUALITY_STORAGE_KEY)
    if (raw === 'fast' || raw === 'balanced' || raw === 'quality') {
      return raw
    }
  } catch {
    // Ignore storage access restrictions in locked-down browser contexts
  }
  return 'balanced'
}

export function writeStoredKvmQualityMode(mode: KvmQualityMode): void {
  try {
    window.localStorage.setItem(KVM_QUALITY_STORAGE_KEY, mode)
  } catch {
    // Ignore storage access restrictions in locked-down browser contexts
  }
}

export function extractKvmErrorMessage(err: unknown, fallback: string): string {
  const axiosLike = err as { response?: { data?: { error?: string } }; message?: string }
  return axiosLike?.response?.data?.error || axiosLike?.message || fallback
}

// Opens the blank tab synchronously inside the click gesture to bypass popup blockers,
// clears window.opener, and navigates to the tokenized /kvm URL once minted.
export async function launchTokenizedKvmTab(
  onBlocked: () => void,
  onError: (msg: string) => void,
  fallbackErr: string,
): Promise<void> {
  const tab = window.open('', '_blank')
  if (!tab) {
    onBlocked()
    return
  }
  try {
    tab.opener = null
    const res = await createKvmToken()
    tab.location.replace(res.url)
  } catch (err) {
    tab.close()
    onError(extractKvmErrorMessage(err, fallbackErr))
  }
}


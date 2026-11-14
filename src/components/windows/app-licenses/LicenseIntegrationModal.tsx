import { useState } from 'react'
import { Code2, Copy, Check, FileCode2 } from 'lucide-react'
import { toast } from 'sonner'
import { type AppLicense } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface LicenseIntegrationModalProps {
  open: boolean
  onClose: () => void
  license: AppLicense | null
}

export function LicenseIntegrationModal({
  open,
  onClose,
  license,
}: LicenseIntegrationModalProps) {
  const [lang, setLang] = useState<'js' | 'python' | 'curl' | 'php'>('js')
  const [copied, setCopied] = useState<string | null>(null)

  if (!open || !license) return null

  const baseUrl = window.location.origin
  const verifyEndpoint = `${baseUrl}/api/v1/app-licenses/verify?key=${encodeURIComponent(
    license.licenseKey
  )}`

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    toast.success('Disalin ke papan klip!')
    setTimeout(() => setCopied(null), 2500)
  }

  const codeSnippets = {
    js: `// Validasi Lisensi di Node.js / Express / Next.js
async function checkReneoLicense(key) {
  try {
    const res = await fetch(\`${baseUrl}/api/v1/app-licenses/verify?key=\${encodeURIComponent(key)}\`);
    const data = await res.json();
    
    if (data.valid && data.status === 'ACTIVE') {
      return { valid: true, features: data.features, daysLeft: data.daysLeft };
    } else {
      return { valid: false, status: data.status };
    }
  } catch (err) {
    return { valid: false, error: err };
  }
}

// Jalankan verifikasi
checkReneoLicense('${license.licenseKey}');`,

    python: `# Validasi Lisensi di Python / FastAPI / Django
import requests

def check_reneo_license(license_key: str):
    url = f"${baseUrl}/api/v1/app-licenses/verify?key={license_key}"
    try:
        response = requests.get(url, timeout=5)
        data = response.json()
        if data.get("valid") and data.get("status") in ["ACTIVE", "TRIAL"]:
            return True, data.get("features", {})
        else:
            return False, {}
    except requests.RequestException:
        return False, {}

is_valid, features = check_reneo_license("${license.licenseKey}")`,

    curl: `# Verifikasi cepat via terminal / bash
curl -s -X GET "${verifyEndpoint}"`,

    php: `<?php
// Validasi Lisensi di PHP / Laravel
function verifyReneoLicense($licenseKey) {
    $url = "${baseUrl}/api/v1/app-licenses/verify?key=" . urlencode($licenseKey);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $response = curl_exec($ch);
    curl_close($ch);

    if ($response) {
        $data = json_decode($response, true);
        if (!empty($data['valid']) && $data['status'] === 'ACTIVE') {
            return $data;
        }
    }
    return false;
}

$license = verifyReneoLicense("${license.licenseKey}");
if ($license) {
    echo "Lisensi Valid! Berakhir: " . $license['expiresAt'];
} else {
    echo "Lisensi Tidak Valid!";
}
?>`,
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Integrasi API & Verifikasi Lisensi`}
      subtitle={`Panduan menghubungkan aplikasi "${license.appName}" ke sistem lisensi Reneo.`}
      icon={<Code2 className="text-emerald-500" size={20} />}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] text-[var(--text-secondary)]">
            Endpoint verifikasi publik dapat diakses tanpa autentikasi cookie oleh service backend Anda.
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* License summary */}
        <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] text-[var(--text-secondary)] block">Aplikasi & ID:</span>
            <span className="font-bold text-sm text-[var(--win-text)]">
              {license.appName}{' '}
              <span className="font-mono text-xs font-normal text-[var(--text-secondary)]">
                ({license.catalogId})
              </span>
            </span>
          </div>

          <div>
            <span className="text-[11px] text-[var(--text-secondary)] block">License Key:</span>
            <div className="flex items-center gap-1.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
              <span>{license.licenseKey}</span>
              <button
                type="button"
                onClick={() => handleCopy(license.licenseKey, 'key')}
                className="p-1 text-[var(--text-secondary)] hover:text-emerald-500 rounded transition"
                title="Salin Key"
              >
                {copied === 'key' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div>
            <span className="text-[11px] text-[var(--text-secondary)] block">Status Saat Ini:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {license.status} ({license.daysLeft} hari lagi)
            </span>
          </div>
        </div>

        {/* API Endpoint box */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-[var(--win-text)]">
            Endpoint Verifikasi REST API (GET):
          </label>
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] font-mono text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 font-bold shrink-0">
              GET
            </span>
            <span className="truncate flex-1 text-[var(--win-text)]">{verifyEndpoint}</span>
            <button
              type="button"
              onClick={() => handleCopy(verifyEndpoint, 'url')}
              className="p-1 text-[var(--text-secondary)] hover:text-emerald-500 rounded transition shrink-0"
              title="Salin URL"
            >
              {copied === 'url' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Code Snippets Tabs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--win-text)]">Contoh Kode Integrasi:</span>
            <div className="flex items-center gap-1 bg-[var(--win-bg)] border border-[var(--win-border)] p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setLang('js')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  lang === 'js'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                }`}
              >
                JavaScript / Node
              </button>
              <button
                type="button"
                onClick={() => setLang('python')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  lang === 'python'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                }`}
              >
                Python
              </button>
              <button
                type="button"
                onClick={() => setLang('curl')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  lang === 'curl'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setLang('php')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  lang === 'php'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                }`}
              >
                PHP
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] font-mono text-[11px] overflow-x-auto leading-relaxed text-[var(--win-text)] max-h-64">
              {codeSnippets[lang]}
            </pre>
            <button
              type="button"
              onClick={() => handleCopy(codeSnippets[lang], 'code')}
              className="absolute top-3 right-3 p-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] text-[var(--text-secondary)] hover:text-emerald-500 shadow-sm transition"
              title="Salin Kode"
            >
              {copied === 'code' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Response Schema Info */}
        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1.5">
          <h5 className="font-bold text-[var(--win-text)] flex items-center gap-1.5">
            <FileCode2 size={14} className="text-emerald-500" />
            Contoh Respon JSON dari API:
          </h5>
          <pre className="font-mono text-[10px] text-[var(--text-secondary)] bg-[var(--win-bg)] p-2 rounded-lg border border-[var(--win-border)]">
{`{
  "valid": true,
  "status": "ACTIVE",
  "appName": "${license.appName}",
  "catalogId": "${license.catalogId}",
  "planName": "${license.planName}",
  "expiresAt": "${license.expiresAt}",
  "daysLeft": ${license.daysLeft},
  "features": ${JSON.stringify(license.features || { broadcast: true, apiAccess: true }, null, 2)}
}`}
          </pre>
        </div>
      </div>
    </Modal>
  )
}

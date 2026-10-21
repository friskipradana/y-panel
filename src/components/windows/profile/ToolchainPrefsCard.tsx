import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { saveToolchainPrefs, type ToolchainPrefs } from '@/api/toolchain'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const envToText = (env: Record<string, string>) =>
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

// KEY=VALUE per line; blank lines and lines that start with # are skipped
function parseEnv(text: string): { env: Record<string, string>; bad: string | null } {
  const env: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at < 1) return { env, bad: line }
    env[line.slice(0, at).trim()] = line.slice(at + 1)
  }
  return { env, bad: null }
}

// What the account chooses for its environment: folders on the PATH, variables, and a piece of shell. The panel keeps them in
// ~/.reneo and puts them in every shell (ssh and terminal) and every project of the account.
export function ToolchainPrefsCard({ prefs, onSaved }: { prefs: ToolchainPrefs; onSaved: () => void }) {
  const { t } = useI18n()
  const initial = { path: prefs.path.join('\n'), env: envToText(prefs.env), shell: prefs.shell }
  const [path, setPath] = useState(initial.path)
  const [env, setEnv] = useState(initial.env)
  const [shell, setShell] = useState(initial.shell)
  const dirty = path !== initial.path || env !== initial.env || shell !== initial.shell

  const save = useMutation({
    mutationFn: () => {
      const parsed = parseEnv(env)
      if (parsed.bad) throw new Error(t('toolchain.prefs.badEnv', { line: parsed.bad }))
      return saveToolchainPrefs({ path: path.split('\n').map((l) => l.trim()).filter(Boolean), env: parsed.env, shell })
    },
    onSuccess: () => {
      alertLib.fire(t('toolchain.prefs.savedTitle'), t('toolchain.prefs.savedMessage'), 'success', 'profile')
      onSaved()
    },
    onError: (e) => alertLib.fire(t('toolchain.prefs.failed'), (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e as Error).message, 'error', 'profile'),
  })

  return (
    <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
      <SectionHeader icon={<SlidersHorizontal />} title={t('toolchain.prefs.title')} subtitle={t('toolchain.prefs.subtitle')} size="sm" />
      <Field label={t('toolchain.prefs.path')} hint={t('toolchain.prefs.pathHint')}>
        <Textarea mono rows={3} value={path} onChange={(e) => setPath(e.target.value)} placeholder={'~/tools/bin\n/opt/mytool/bin'} spellCheck={false} />
      </Field>
      <Field label={t('toolchain.prefs.env')} hint={t('toolchain.prefs.envHint')}>
        <Textarea mono rows={4} value={env} onChange={(e) => setEnv(e.target.value)} placeholder={'NODE_ENV=production\nPM2_HOME=/home/me/.pm2'} spellCheck={false} />
      </Field>
      <Field label={t('toolchain.prefs.shell')} hint={t('toolchain.prefs.shellHint')}>
        <Textarea mono rows={4} value={shell} onChange={(e) => setShell(e.target.value)} placeholder={"alias ll='ls -la'\nexport EDITOR=nano"} spellCheck={false} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, KeyRound, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getAISettings, saveAISettings, testAISettings } from '@/api/ai'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

export function AiSettingsTab() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings-ai'], queryFn: getAISettings })

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('gpt-4o-mini')
  const [apiKey, setApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [temperature, setTemperature] = useState('0.3')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!q.data || hydrated) return
    setEnabled(q.data.enabled)
    setProvider(q.data.provider || 'openai')
    setBaseUrl(q.data.baseUrl || '')
    setModel(q.data.model || '')
    setTemperature(String(q.data.temperature ?? 0.3))
    setHydrated(true)
  }, [q.data, hydrated])

  const saveMut = useMutation({
    mutationFn: () =>
      saveAISettings({
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
        clearApiKey,
        temperature: Number(temperature) || 0.3,
        enabled,
      }),
    onSuccess: (saved) => {
      setApiKey('')
      setClearApiKey(false)
      setEnabled(saved.enabled)
      setBaseUrl(saved.baseUrl)
      setModel(saved.model)
      toast.success(t('settings.ai.saved'))
      void qc.invalidateQueries({ queryKey: ['settings-ai'] })
      void qc.invalidateQueries({ queryKey: ['devdesk-overview'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const testMut = useMutation({
    mutationFn: () =>
      testAISettings({
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
        temperature: Number(temperature) || 0.3,
      }),
    onSuccess: (res) => toast.success(t('settings.ai.testOk', { reply: res.reply })),
    onError: (e: Error) => toast.error(e.message),
  })

  if (q.isLoading) return <LoadingState>{t('common.loading')}</LoadingState>
  if (q.isError) {
    return (
      <ErrorState
        title={t('settings.ai.loadError')}
        hint={(q.error as Error)?.message}
        action={<Button size="sm" variant="ghost" onClick={() => void q.refetch()}>{t('common.retry')}</Button>}
      />
    )
  }

  const presets = q.data?.presets ?? []
  const currentPreset = presets.find((p) => p.id === provider)
  const hasSavedKey = Boolean(q.data?.hasApiKey) && !clearApiKey

  const handleProviderChange = (nextId: string) => {
    setProvider(nextId)
    const p = presets.find((x) => x.id === nextId)
    if (p) {
      setBaseUrl(p.defaultBaseUrl)
      setModel(p.defaultModel)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="panel-shell-card settings-card flex flex-col gap-4 p-4">
        <SectionHeader
          icon={<Bot />}
          title={t('settings.ai.cardTitle')}
          subtitle={t('settings.ai.cardDesc')}
          tone="primary"
          actions={
            <Badge tone={enabled && (hasSavedKey || !currentPreset?.keyRequired) ? 'success' : 'neutral'} dot>
              {enabled ? t('common.active') : t('common.inactive')}
            </Badge>
          }
          className="mb-0"
        />

        <SettingRow
          title={t('settings.ai.enableTitle')}
          description={t('settings.ai.enableDesc')}
          control={<ToggleSwitch checked={enabled} onChange={() => setEnabled((v) => !v)} label={t('settings.ai.enableTitle')} />}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('settings.ai.providerLabel')}>
            <Select
              value={provider}
              onChange={handleProviderChange}
              options={presets.map((p) => ({ value: p.id, label: p.label }))}
            />
          </Field>
          <Field label={t('settings.ai.modelLabel')}>
            <TextInput
              mono
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={currentPreset?.defaultModel || 'gpt-4o-mini'}
            />
          </Field>
        </div>

        <Field label={t('settings.ai.baseUrlLabel')} hint={t('settings.ai.baseUrlHint')}>
          <TextInput
            mono
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={currentPreset?.defaultBaseUrl || 'https://api.openai.com/v1'}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
          <Field
            label={t('settings.ai.apiKeyLabel')}
            hint={hasSavedKey ? t('settings.ai.apiKeyStoredHint') : t('settings.ai.apiKeyEncryptedHint')}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PasswordInput
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setClearApiKey(false)
                  }}
                  placeholder={hasSavedKey ? '••••••••••••••••' : t('settings.ai.apiKeyPlaceholder')}
                />
              </div>
              {hasSavedKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  onClick={() => {
                    setClearApiKey(true)
                    setApiKey('')
                  }}
                >
                  {t('common.clear')}
                </Button>
              ) : null}
            </div>
          </Field>

          <Field label={t('settings.ai.tempLabel')}>
            <TextInput
              mono
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)] pt-3">
          <div className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-secondary)]">
            <KeyRound className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t('settings.ai.securityNote')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
              loading={testMut.isPending}
              onClick={() => testMut.mutate()}
            >
              {t('settings.ai.testBtn')}
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={<Save className="h-3.5 w-3.5" strokeWidth={1.75} />}
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleArrowUp, Download, Trash2, Wrench } from 'lucide-react'
import { getToolchain, type ToolStatus } from '@/api/toolchain'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { ToolchainRunModal, type ToolchainRun } from './ToolchainRunModal'
import { ToolchainPrefsCard } from './ToolchainPrefsCard'

const errorText = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ?? (e as Error)?.message ?? fallback

// The page of the development tools of the account: what it has, what it can install without root, and how it shapes its environment
export function ToolchainTools() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const info = useQuery({ queryKey: ['toolchain'], queryFn: getToolchain, retry: 0, staleTime: 30_000 })
  const [versions, setVersions] = useState<Record<string, string>>({})
  const [run, setRun] = useState<ToolchainRun | null>(null)

  if (info.isLoading) return <LoadingState>{t('toolchain.loading')}</LoadingState>
  if (info.isError || !info.data) return <ErrorState title={t('toolchain.loadFailed')} hint={errorText(info.error, t('toolchain.loadFailedHint'))} />
  const data = info.data
  if (!data.supported) return <EmptyState>{t('toolchain.unsupported')}</EmptyState>

  const hasNpm = data.checks.some((c) => c.binary === 'npm' && c.installed)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['toolchain'] })

  const remove = async (tool: ToolStatus) => {
    const ok = await alertLib.confirm(t('toolchain.removeTitle', { name: tool.name }), t('toolchain.removeConfirm', { name: tool.name }), t('common.delete'), t('common.cancel'), 'warning', 'profile')
    if (ok) setRun({ action: 'remove', tool: tool.id, name: tool.name, version: '' })
  }

  const statusBadge = (tool: ToolStatus) =>
    tool.installed ? (
      <Badge tone={tool.source === 'personal' ? 'success' : 'info'} dot>
        {tool.version ? `${tool.version} · ` : ''}
        {t(tool.source === 'personal' ? 'toolchain.source.personal' : 'toolchain.source.system')}
      </Badge>
    ) : (
      <Badge tone="neutral">{t('toolchain.notInstalled')}</Badge>
    )

  return (
    <div className="space-y-3">
      <ToolchainRunModal run={run} onClose={() => setRun(null)} onFinished={refresh} />

      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        <SectionHeader icon={<Wrench />} title={t('toolchain.title')} subtitle={t('toolchain.subtitle', { home: data.home })} size="sm" />
        {data.tools.map((tool) => {
          const blocked = !!tool.requires?.includes('npm') && !hasNpm
          const personal = tool.installed && tool.source === 'personal'
          return (
            <SettingRow
              key={tool.id}
              title={tool.name}
              description={blocked && !tool.installed ? t('toolchain.needsNpm') : tool.installed && tool.path ? tool.path : tool.description}
              control={statusBadge(tool)}
            >
              <div className="flex flex-wrap items-center gap-2">
                {tool.versioned ? (
                  <TextInput
                    mono
                    className="!h-7 !w-28 !text-[12px]"
                    aria-label={t('toolchain.versionOf', { name: tool.name })}
                    placeholder={tool.id === 'node' ? 'lts' : 'latest'}
                    value={versions[tool.id] ?? ''}
                    onChange={(e) => setVersions((all) => ({ ...all, [tool.id]: e.target.value }))}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={blocked}
                  icon={tool.installed ? <CircleArrowUp className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  onClick={() => setRun({ action: 'install', tool: tool.id, name: tool.name, version: (versions[tool.id] ?? '').trim() })}
                >
                  {t(tool.installed ? 'toolchain.update' : 'toolchain.install')}
                </Button>
                {personal ? (
                  <IconButton label={t('toolchain.removeTitle', { name: tool.name })} tone="danger" onClick={() => void remove(tool)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                ) : null}
              </div>
            </SettingRow>
          )
        })}
        <SettingRow
          title={t('toolchain.system')}
          description={t('toolchain.systemHint')}
          control={<span />}
        >
          <div className="flex flex-wrap gap-1.5">
            {data.checks.map((c) => (
              <Badge key={c.binary} tone={c.installed ? 'success' : 'warning'} dot title={c.version || undefined}>
                {c.binary}
              </Badge>
            ))}
          </div>
        </SettingRow>
      </div>

      <ToolchainPrefsCard prefs={data.prefs} onSaved={refresh} />
    </div>
  )
}

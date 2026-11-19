import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Globe2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  applyCloudflareAICrawlerPreset,
  updateCloudflareBotManagement,
  type UpdateBotManagementPayload,
} from '@/api/cloudflare'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { CfPermissionNotice } from './CfPermissionNotice'
import { cfErrDesc, splitCommaList } from './tunnelForms'
import { TunnelsScope } from './TunnelsScope'
import { WafRulesSection } from './WafRulesSection'
import type { TunnelsWindowState } from './useTunnelsWindow'

const AI_PRESET_REF = 'reneo_allow_ai_crawlers'
const DEFAULT_PRESET_PATHS = '/app/reneo-crm, /llms.txt, /llms-full.txt, /sitemap.xml, /robots.txt'
const DEFAULT_PRESET_AGENTS = 'ChatGPT-User, OAI-SearchBot, GPTBot'

// Zone security controls: Bot Fight Mode, AI Bot blocking, 1-click AI crawler Skip preset, and custom WAF rules.
export function CloudflareSecurityPanel({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    selectedDomainId,
    selectedDomain,
    safeDomains,
    domainsLoading,
    securityQuery,
    securitySearch,
    setShowWafRuleModal,
  } = tw
  const qc = useQueryClient()

  const data = securityQuery.data
  const zoneName = data?.zoneName || selectedDomain?.name || ''

  const [presetHost, setPresetHost] = useState('')
  const [applyToAllHosts, setApplyToAllHosts] = useState(false)
  const [presetPathsText, setPresetPathsText] = useState(DEFAULT_PRESET_PATHS)
  const [presetAgentsText, setPresetAgentsText] = useState(DEFAULT_PRESET_AGENTS)
  const [allowVerifiedBots, setAllowVerifiedBots] = useState(true)
  const [disableAiBlock, setDisableAiBlock] = useState(true)
  const [disableFightMode, setDisableFightMode] = useState(false)
  const [showPresetAdvanced, setShowPresetAdvanced] = useState(false)
  const [lastSkippedScopes, setLastSkippedScopes] = useState<string[]>([])

  useEffect(() => {
    setLastSkippedScopes([])
    setPresetHost(zoneName ? `panel.${zoneName}` : '')
  }, [selectedDomainId, zoneName])

  const updateBotMut = useMutation({
    mutationFn: (payload: UpdateBotManagementPayload) => updateCloudflareBotManagement(selectedDomainId, payload),
    onSuccess: () => {
      toast.success(t('tunnels.security.botUpdated'))
      void qc.invalidateQueries({ queryKey: ['cloudflare-zone-security', selectedDomainId] })
    },
    onError: (e: unknown) => toast.error(t('tunnels.security.botUpdateFailed'), { description: cfErrDesc(e) }),
  })

  const presetMut = useMutation({
    mutationFn: () =>
      applyCloudflareAICrawlerPreset(selectedDomainId, {
        hostname: applyToAllHosts ? '' : presetHost.trim(),
        applyToAllHosts,
        pathPrefixes: splitCommaList(presetPathsText),
        allowVerifiedBots,
        userAgents: splitCommaList(presetAgentsText),
        disableAiBotsProtection: disableAiBlock,
        disableFightMode,
      }),
    onSuccess: (res) => {
      setLastSkippedScopes(res.skippedScopes ?? [])
      if (res.botWarning) {
        toast.warning(t('tunnels.security.presetAppliedWithBotWarn'), { description: res.botWarning })
      } else {
        toast.success(t('tunnels.security.presetApplied'))
      }
      void qc.invalidateQueries({ queryKey: ['cloudflare-zone-security', selectedDomainId] })
    },
    onError: (e: unknown) => toast.error(t('tunnels.security.presetFailed'), { description: cfErrDesc(e) }),
  })

  const customRules = useMemo(() => data?.customRules ?? [], [data?.customRules])
  const activePresetRule = useMemo(
    () => customRules.find((r) => r.ref === AI_PRESET_REF),
    [customRules],
  )

  return (
    <>
      <TunnelsScope tw={tw} />

      {!domainsLoading && safeDomains.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState icon={<Globe2 />}>{t('tunnels.security.emptyDomainsHint')}</EmptyState>
        </div>
      ) : !selectedDomainId ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState icon={<Shield />}>{t('tunnels.security.noZoneTitle')}</EmptyState>
        </div>
      ) : securityQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <LoadingState>{t('tunnels.security.loading')}</LoadingState>
        </div>
      ) : securityQuery.isError ? (
        <div className="flex-1 p-6">
          <ErrorState title={t('tunnels.security.loadFailed')} hint={cfErrDesc(securityQuery.error)} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-4 mobile:p-3">
          <div className="@container space-y-3.5 mobile:space-y-3">
            <div className="cloudflare-security__cards grid grid-cols-1 gap-3 @[780px]:grid-cols-2 @[780px]:items-start">
              {/* Bot Management & AI Crawlers */}
              <section className="panel-shell-card settings-card cloudflare-security-card">
                <SectionHeader
                  icon={<Bot />}
                  tone="primary"
                  title={t('tunnels.security.botSectionTitle')}
                  subtitle={t('tunnels.security.botSectionDesc')}
                  actions={
                    data?.botManagement ? (
                      <Badge
                        tone={data.botManagement.ai_bots_protection === 'disabled' ? 'success' : 'warning'}
                        dot
                        size="sm"
                      >
                        {t(`tunnels.security.aiBots.${data.botManagement.ai_bots_protection || 'disabled'}`)}
                      </Badge>
                    ) : null
                  }
                />

                {data?.botPermissionError || (data?.botError && !data?.botManagement) ? (
                  <CfPermissionNotice
                    title={t('tunnels.security.botPermMissing')}
                    hint={t('tunnels.security.botPermHint')}
                    rawError={data?.botError}
                  />
                ) : data?.botManagement ? (
                  <div>
                    <SettingRow
                      icon={<ShieldCheck />}
                      tone={data.botManagement.ai_bots_protection === 'disabled' ? 'success' : 'warning'}
                      title={t('tunnels.security.aiBotsLabel')}
                      description={t('tunnels.security.aiBotsDesc')}
                      control={
                        <Select
                          size="sm"
                          className="w-[175px] max-w-full"
                          disabled={updateBotMut.isPending}
                          value={data.botManagement.ai_bots_protection || 'disabled'}
                          onChange={(value) =>
                            updateBotMut.mutate({
                              aiBotsProtection: value as 'disabled' | 'block' | 'only_on_ad_pages',
                            })
                          }
                          options={[
                            { value: 'disabled', label: t('tunnels.security.aiBots.disabled'), dotTone: 'success' },
                            { value: 'block', label: t('tunnels.security.aiBots.block'), dotTone: 'danger' },
                            {
                              value: 'only_on_ad_pages',
                              label: t('tunnels.security.aiBots.only_on_ad_pages'),
                              dotTone: 'warning',
                            },
                          ]}
                        />
                      }
                    />

                    <SettingRow
                      icon={<Bot />}
                      tone={data.botManagement.fight_mode ? 'warning' : 'neutral'}
                      title={t('tunnels.security.fightModeLabel')}
                      description={t('tunnels.security.fightModeDesc')}
                      control={
                        <ToggleSwitch
                          checked={!!data.botManagement.fight_mode}
                          disabled={updateBotMut.isPending}
                          label={t('tunnels.security.fightModeLabel')}
                          onChange={() => updateBotMut.mutate({ fightMode: !data.botManagement?.fight_mode })}
                        />
                      }
                    />

                    <SettingRow
                      icon={<SlidersHorizontal />}
                      tone="neutral"
                      title={t('tunnels.security.enableJsLabel')}
                      description={t('tunnels.security.enableJsDesc')}
                      control={
                        <ToggleSwitch
                          checked={!!data.botManagement.enable_js}
                          disabled={updateBotMut.isPending}
                          label={t('tunnels.security.enableJsLabel')}
                          onChange={() => updateBotMut.mutate({ enableJs: !data.botManagement?.enable_js })}
                        />
                      }
                    />
                  </div>
                ) : null}
              </section>

              {/* 1-Click Preset for AI Crawlers & Public Endpoints */}
              <section className="panel-shell-card settings-card cloudflare-security-card">
                <SectionHeader
                  icon={<Globe2 />}
                  tone={activePresetRule ? 'success' : 'info'}
                  title={t('tunnels.security.presetTitle')}
                  subtitle={t('tunnels.security.presetSubtitle')}
                  actions={
                    activePresetRule ? (
                      <Badge tone="success" dot size="sm">
                        {t('tunnels.security.presetActive')}
                      </Badge>
                    ) : null
                  }
                />

                <div className="flex flex-col gap-2.5 pt-2.5 border-t border-[var(--win-border)]">
                  <Field label={t('tunnels.security.presetHost')}>
                    <div className="cloudflare-security__host-row flex flex-col gap-2 sm:flex-row sm:items-center mobile:flex-col mobile:items-stretch">
                      <TextInput
                        mono
                        value={presetHost}
                        disabled={applyToAllHosts}
                        onChange={(e) => setPresetHost(e.target.value)}
                        placeholder={t('tunnels.security.presetHostPlaceholder')}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="primary"
                        loading={presetMut.isPending}
                        disabled={!!data?.wafPermissionError || (!applyToAllHosts && !presetHost.trim())}
                        onClick={() => presetMut.mutate()}
                        className="shrink-0 mobile:w-full"
                      >
                        {activePresetRule ? t('tunnels.security.presetUpdate') : t('tunnels.security.presetApply')}
                      </Button>
                    </div>
                  </Field>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <Checkbox
                        checked={allowVerifiedBots}
                        onChange={setAllowVerifiedBots}
                        label={t('tunnels.security.presetVerifiedBots')}
                      />
                      <Checkbox
                        checked={disableAiBlock}
                        onChange={setDisableAiBlock}
                        label={t('tunnels.security.presetDisableAiBlock')}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={
                        showPresetAdvanced ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      }
                      onClick={() => setShowPresetAdvanced((v) => !v)}
                      className="mobile:ml-auto"
                    >
                      {showPresetAdvanced
                        ? t('tunnels.security.presetHideCustomize')
                        : t('tunnels.security.presetCustomize')}
                    </Button>
                  </div>

                  {showPresetAdvanced ? (
                    <div className="space-y-2.5 pt-2 border-t border-[var(--win-border)]">
                      <Checkbox
                        checked={applyToAllHosts}
                        onChange={setApplyToAllHosts}
                        label={t('tunnels.security.presetAllHosts')}
                      />
                      <Field label={t('tunnels.security.presetPaths')}>
                        <TextInput
                          mono
                          value={presetPathsText}
                          onChange={(e) => setPresetPathsText(e.target.value)}
                          placeholder={t('tunnels.security.presetPathsPlaceholder')}
                        />
                      </Field>
                      <Field label={t('tunnels.security.presetAgents')}>
                        <TextInput
                          mono
                          value={presetAgentsText}
                          onChange={(e) => setPresetAgentsText(e.target.value)}
                          placeholder={t('tunnels.security.presetAgentsPlaceholder')}
                        />
                      </Field>
                      <Checkbox
                        checked={disableFightMode}
                        onChange={setDisableFightMode}
                        tone="warning"
                        label={t('tunnels.security.presetDisableFightMode')}
                      />
                    </div>
                  ) : null}

                  {lastSkippedScopes.length > 0 ? (
                    <p className="panel-mono text-[11px] text-[var(--text-secondary)]">
                      {t('tunnels.security.presetScopes', { scopes: lastSkippedScopes.join(', ') })}
                    </p>
                  ) : activePresetRule ? (
                    <p
                      className="panel-mono text-[11px] text-[var(--text-secondary)] truncate"
                      title={activePresetRule.expression}
                    >
                      {activePresetRule.expression}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            <WafRulesSection
              zoneId={selectedDomainId}
              customRules={customRules}
              wafPermissionError={data?.wafPermissionError}
              wafError={data?.wafError}
              search={securitySearch}
              onOpenAddModal={() => setShowWafRuleModal(true)}
            />
          </div>
        </div>
      )}
    </>
  )
}

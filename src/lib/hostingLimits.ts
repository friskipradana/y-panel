import type { PublicPlan } from '@/api/hosting'

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

// Shared technical quota & resource limits summary lines for hosting cards (landing pricing & order page)
export function getPlanLimits(plan: PublicPlan, t: TranslateFn, mainDomain?: string): string[] {
  const disk = plan.diskQuotaMb >= 1024 ? `${Math.round((plan.diskQuotaMb / 1024) * 10) / 10} GB` : `${plan.diskQuotaMb} MB`
  const ram = plan.memoryLimitMb >= 1024 ? `${Math.round((plan.memoryLimitMb / 1024) * 10) / 10} GB` : `${plan.memoryLimitMb} MB`
  return [
    ...(mainDomain ? [t('hosting.landing.panelAddress', { domain: mainDomain })] : []),
    t('hosting.landing.projects', { count: plan.maxProjects }),
    t('hosting.landing.databases', { count: plan.maxDatabases }),
    ...(plan.maxApps > 0 ? [t('hosting.landing.apps', { count: plan.maxApps })] : []),
    ...(plan.includedCatalogId === 'reneo-crm' ? [t('hosting.landing.includedReneoCrm')] : []),
    ...(plan.maxSubdomains > 0 ? [t('hosting.landing.subdomains', { count: plan.maxSubdomains })] : []),
    ...(plan.maxCustomDomains > 0 ? [t('hosting.landing.customDomains', { count: plan.maxCustomDomains })] : []),
    ...(plan.ownNotify ? [t('hosting.landing.ownNotify')] : []),
    t('hosting.landing.disk', { amount: disk }),
    t('hosting.landing.ram', { amount: ram }),
  ]
}

// Human-readable benefit lines derived directly from a license plan's JSON features map
export function describeLicenseFeatures(features: Record<string, boolean | number | string> | undefined, t: TranslateFn): string[] {
  if (!features) return []
  const items: string[] = []
  const maxContacts = Number(features.maxContacts ?? 0)
  if (features.unlimitedContacts === true || (features.maxContacts !== undefined && maxContacts === 0)) {
    items.push(t('order.addon.featUnlimitedContacts'))
  } else if (maxContacts > 0) {
    items.push(t('order.addon.featContacts', { count: maxContacts.toLocaleString('id-ID') }))
  }

  if (features.unlimitedBroadcast === true || features.broadcast === true) {
    items.push(t('order.addon.featUnlimitedBroadcast'))
  } else {
    const maxBroadcast = Number(features.maxBroadcastPerMonth ?? 0)
    if (maxBroadcast > 0) {
      items.push(t('order.addon.featBroadcastLimit', { count: maxBroadcast.toLocaleString('id-ID') }))
    }
  }

  if (features.liveChat === true || features.liveChatCrm === true) {
    items.push(t('order.addon.featLiveChat'))
  }

  const maxSessions = Number(features.maxSessions ?? (features.multiSession ? 5 : 1))
  if (maxSessions > 1) {
    items.push(t('order.addon.featSessions', { count: maxSessions }))
  } else if (features.maxSessions !== undefined || features.multiSession !== undefined) {
    items.push(t('order.addon.featSingleSession'))
  }

  const maxAgents = Number(features.maxAgents ?? features.maxUsers ?? 1)
  if (features.multiAgent === true || maxAgents > 1) {
    items.push(t('order.addon.featAgents', { count: Math.max(1, maxAgents) }))
  } else if (features.maxAgents !== undefined || features.maxUsers !== undefined) {
    items.push(t('order.addon.featSingleAgent'))
  }

  if (features.customRoles === true) {
    items.push(t('order.addon.featCustomRoles'))
  }
  if (features.omnichannel === true) {
    const chLimit = Number(features.maxChannels ?? 0)
    items.push(
      chLimit > 0
        ? t('order.addon.featOmnichannelLimit', { count: chLimit })
        : t('order.addon.featOmnichannelUnlimited')
    )
  }
  if (features.scheduledPosts === true) {
    items.push(t('order.addon.featScheduledPosts'))
  }
  if (features.aiAgent === true) {
    items.push(t('order.addon.featAiAgent'))
  }
  if (features.mcpTools === true) {
    items.push(t('order.addon.featMcpTools'))
  }
  if (features.birthdayBot === true || features.birthdayAutomation === true) {
    items.push(t('order.addon.featBirthdayBot'))
  }
  if (features.wahaSync === true) {
    items.push(t('order.addon.featWahaSync'))
  }
  if (features.exportReports === true) {
    items.push(t('order.addon.featExportReports'))
  }
  if (features.apiAccess === true) {
    items.push(t('order.addon.featApiAccess'))
  }

  const priority = typeof features.supportPriority === 'string' ? features.supportPriority.toLowerCase() : ''
  if (priority === 'vip') items.push(t('order.addon.featSupportVip'))
  else if (priority === 'priority') items.push(t('order.addon.featSupportPriority'))
  else if (priority === 'fast') items.push(t('order.addon.featSupportFast'))

  return items
}

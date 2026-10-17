import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Globe2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createTunnel, getCFConfig, getCFZones, listCloudflareTunnelProfiles, listTunnels } from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { slugifyRoutePart } from '@/components/windows/tunnels/tunnelForms'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'
import type { Container } from '@/types'
import { domainTargets } from './domainTargets'

// 1 to 63 characters of a DNS label; "@" is the domain itself
const LABEL_RE = /^(@|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)$/

interface ContainerDomainModalProps {
  container: Container | null
  onClose: () => void
}

// Points a domain of the account's Cloudflare at a container: a route of a tunnel profile to the port the container serves
export function ContainerDomainModal({ container, onClose }: ContainerDomainModalProps) {
  // a fresh form for every container
  return <DomainForm key={container?.Id ?? 'none'} container={container} onClose={onClose} />
}

function DomainForm({ container, onClose }: ContainerDomainModalProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const open = !!container
  const name = container?.Names?.[0]?.replace(/^\//, '') ?? ''
  const targets = useMemo(() => (container ? domainTargets(container) : []), [container])

  const config = useQuery({ queryKey: ['cf-config'], queryFn: getCFConfig, enabled: open, staleTime: 30_000 })
  const ready = config.data?.configured === true && config.data.status === 'active'
  const zones = useQuery({ queryKey: ['cf-zones'], queryFn: getCFZones, enabled: open && ready, staleTime: 30_000 })
  const profiles = useQuery({ queryKey: ['cloudflare-tunnel-profiles'], queryFn: listCloudflareTunnelProfiles, enabled: open && ready, staleTime: 15_000 })
  const routes = useQuery({ queryKey: ['tunnels', 'for-docker'], queryFn: () => listTunnels({ limit: 100, offset: 0 }), enabled: open && ready, staleTime: 15_000 })

  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? '')
  const [protocol, setProtocol] = useState('http')
  const [profileId, setProfileId] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [subdomain, setSubdomain] = useState(slugifyRoutePart(name))
  // a container that already has a tunnel shows it first; a new one is added only on request
  const [adding, setAdding] = useState(false)

  const target = targets.find((item) => item.key === targetKey)
  const zoneList = Array.isArray(zones.data) ? zones.data : []
  const profileList = profiles.data ?? []
  const effectiveProfile = profileId || (profileList.length === 1 ? profileList[0].id : '')
  const effectiveZone = zoneId || (zoneList.length === 1 ? zoneList[0].id : '')
  const zone = zoneList.find((z) => z.id === effectiveZone)
  const labelValid = LABEL_RE.test(subdomain)
  const hostname = zone && labelValid ? (subdomain === '@' ? zone.name : `${subdomain}.${zone.name}`) : ''

  // routes that already lead to this container
  const linked = (routes.data?.items ?? []).filter((route) => {
    try {
      const url = new URL(route.targetUrl)
      return targets.some((item) => String(item.port) === (url.port || (url.protocol === 'https:' ? '443' : '80')) && [item.host, 'localhost', '127.0.0.1'].includes(url.hostname))
    } catch {
      return false
    }
  })

  const create = useMutation({
    mutationFn: () =>
      createTunnel({
        name: name || subdomain,
        subdomain,
        domain: zone?.name ?? '',
        zoneId: effectiveZone,
        path: '',
        protocol,
        ip: target?.host ?? 'localhost',
        port: String(target?.port ?? ''),
        profileId: effectiveProfile,
      }),
    onSuccess: (res) => {
      toast.success(t('docker.domain.created', { host: hostname }), { description: res.message })
      void qc.invalidateQueries({ queryKey: ['tunnels'] })
      void qc.invalidateQueries({ queryKey: ['cloudflare-tunnel-profiles'] })
      void qc.invalidateQueries({ queryKey: ['cloudflare-profile-routes'] })
      onClose()
    },
    onError: (e) =>
      alertLib.fire(t('docker.domain.failed'), (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('docker.unknownError'), 'error', 'apps'),
  })

  const openCloudflare = () => {
    useWindowStore.getState().openWindow('tunnels')
    onClose()
  }

  const canSubmit = ready && !!target && !!effectiveProfile && !!zone && labelValid
  const waiting = routes.isLoading
  // the form is the first thing only when nothing is linked yet
  const showForm = ready && targets.length > 0 && !waiting && (adding || linked.length === 0)

  const linkedList = linked.length > 0 ? (
    <div className="space-y-1.5">
      <p className="panel-section-label">{t('docker.domain.linkedCount', { count: linked.length })}</p>
      <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
        {linked.map((route) => (
          <li key={route.id} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
            <span className="min-w-0 flex-1">
              <span className="panel-mono block truncate">{route.cfHostname || route.name}</span>
              <span className="panel-mono block truncate text-[11px] text-[var(--text-secondary)]">{route.targetUrl}</span>
            </span>
            <Badge tone={route.status === 'active' ? 'success' : route.status === 'error' ? 'danger' : 'warning'} dot>
              {t(`tunnels.status.${route.status}`)}
            </Badge>
            {route.cfHostname ? (
              <IconButton label={t('docker.domain.open')} onClick={() => window.open(`https://${route.cfHostname}`, '_blank', 'noopener,noreferrer')}>
                <ExternalLink className="h-3.5 w-3.5" />
              </IconButton>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  ) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('docker.domain.title')}
      subtitle={name}
      icon={<Globe2 />}
      size="md"
      footer={
        !ready ? (
          <>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={openCloudflare}>{t('docker.domain.openCloudflare')}</Button>
          </>
        ) : showForm ? (
          <>
            <Button variant="ghost" onClick={() => (linked.length > 0 ? setAdding(false) : onClose())}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
              {t('docker.domain.connect')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      {config.isLoading || (ready && waiting) ? (
        <p className="text-[12.5px] text-[var(--text-secondary)]">{t('docker.loadingList')}</p>
      ) : !ready ? (
        <p className="panel-alert">{t('docker.domain.notConfigured')}</p>
      ) : targets.length === 0 ? (
        <p className="panel-alert">{t('docker.domain.noPort')}</p>
      ) : (
        <div className="space-y-3.5">
          {linkedList}

          {!showForm ? (
            <Button variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
              {t('docker.domain.addAnother')}
            </Button>
          ) : (
            <div className="space-y-3.5">
              <p className="text-[12.5px] text-[var(--text-secondary)]">{t(linked.length > 0 ? 'docker.domain.addHint' : 'docker.domain.hint')}</p>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Field label={t('docker.domain.profile')} hint={profileList.length === 0 && !profiles.isLoading ? t('docker.domain.noProfile') : undefined}>
                  <Select
                    value={effectiveProfile}
                    onChange={setProfileId}
                    options={profileList.map((p) => ({ value: p.id, label: p.name || p.id }))}
                    placeholder={t('docker.domain.pickProfile')}
                    searchable
                    searchPlaceholder={t('docker.domain.searchProfile')}
                  />
                </Field>
                <Field label={t('docker.domain.protocol')}>
                  <Select value={protocol} onChange={setProtocol} options={[{ value: 'http', label: 'http' }, { value: 'https', label: 'https' }]} />
                </Field>
              </div>

              <Field label={t('docker.domain.target')} hint={t('docker.domain.targetHint')}>
                <Select value={targetKey} onChange={setTargetKey} options={targets.map((item) => ({ value: item.key, label: item.label }))} />
              </Field>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Field label={t('docker.domain.subdomain')} error={subdomain !== '' && !labelValid ? t('docker.domain.subdomainInvalid') : undefined}>
                  <TextInput mono value={subdomain} maxLength={63} autoComplete="off" invalid={subdomain !== '' && !labelValid} onChange={(e) => setSubdomain(e.target.value.toLowerCase().trim())} />
                </Field>
                <Field label={t('docker.domain.domain')}>
                  <Select
                    value={effectiveZone}
                    onChange={setZoneId}
                    options={zoneList.map((z) => ({ value: z.id, label: z.name }))}
                    placeholder={t('docker.domain.pickDomain')}
                    searchable
                    searchPlaceholder={t('docker.domain.searchDomain')}
                  />
                </Field>
              </div>

              {hostname ? (
                <p className="panel-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12.5px]">
                  https://{hostname} &rarr; {protocol}://{target?.host}:{target?.port}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

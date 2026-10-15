import { useMemo, useState } from 'react'
import { Bot, Eye, EyeOff, Globe, KeyRound, ShieldAlert, Terminal } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { CopyBlock } from '@/components/public/CopyBlock'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'

type ClientKey = 'hermes' | 'openclaw' | 'claude' | 'cursor' | 'curl'

const TOKEN_PLACEHOLDER = 'ypat_TOKEN_ANDA'

function jsonConfig(url: string) {
  return JSON.stringify({ mcpServers: { reneo: { url } } }, null, 2)
}

// Generates ready-to-paste connection snippets for the common MCP clients
export function ConnectPanel() {
  const { t } = useI18n()
  const [token, setToken] = useState('')
  const [reveal, setReveal] = useState(false)
  const [client, setClient] = useState<ClientKey>('hermes')

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://panel.example.com'
  const effective = token.trim() || TOKEN_PLACEHOLDER
  const url = `${origin}/mcp?key=${effective}`
  const bearerUrl = `${origin}/mcp`

  const snippets = useMemo<Record<ClientKey, { text: string; hint: string; wrap?: boolean }>>(
    () => ({
      hermes: { text: `hermes mcp add RENEO --url "${url}"`, hint: t('mcpGuide.client.hermesHint'), wrap: true },
      openclaw: {
        text: `openclaw mcp add RENEO --transport streamable-http --url "${url}"`,
        hint: t('mcpGuide.client.openclawHint'),
        wrap: true,
      },
      claude: { text: jsonConfig(url), hint: t('mcpGuide.client.claudeHint') },
      cursor: { text: jsonConfig(url), hint: t('mcpGuide.client.cursorHint') },
      curl: {
        text: [
          `curl -s -X POST "${bearerUrl}" \\`,
          `  -H "Authorization: Bearer ${effective}" \\`,
          `  -H "Content-Type: application/json" \\`,
          `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        ].join('\n'),
        hint: t('mcpGuide.client.curlHint'),
      },
    }),
    [url, bearerUrl, effective, t],
  )

  const tabs: TabItem<ClientKey>[] = [
    { key: 'hermes', label: 'Hermes', icon: <Bot size={13} /> },
    { key: 'openclaw', label: 'OpenClaw', icon: <Globe size={13} /> },
    { key: 'claude', label: 'Claude Desktop' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'curl', label: 'cURL', icon: <Terminal size={13} /> },
  ]
  const active = snippets[client]

  return (
    <section className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6" aria-labelledby="mcp-connect">
      <SectionHeader
        icon={<KeyRound />}
        tone="warning"
        title={t('mcpGuide.connect.title')}
        subtitle={t('mcpGuide.connect.subtitle')}
      />

      <p className="panel-mono mt-3 break-all text-[0.75rem] text-[var(--text-secondary)]">{origin}/mcp</p>

      <div className="mt-4 space-y-4">
        <Field label={t('mcpGuide.connect.tokenLabel')} htmlFor="mcp-token" hint={t('mcpGuide.connect.tokenHint')}>
          <div className="flex items-center gap-2">
            <TextInput
              id="mcp-token"
              mono
              type={reveal ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder={t('mcpGuide.tokenPlaceholder')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="flex-1"
            />
            <IconButton label={reveal ? t('mcpGuide.connect.hide') : t('mcpGuide.connect.show')} onClick={() => setReveal((v) => !v)}>
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </IconButton>
          </div>
        </Field>

        <Tabs items={tabs} value={client} onChange={setClient} label={t('mcpGuide.connect.clients')} className="flex-wrap" />

        <div role="tabpanel" className="space-y-2">
          <p className="text-[0.8125rem] text-[var(--text-secondary)]">{active.hint}</p>
          <CopyBlock text={active.text} wrap={active.wrap} />
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--panel-warning-text)]/30 bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem]">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-[var(--panel-warning-text)]" />
          <p className="leading-relaxed text-[var(--win-text)]">{t('mcpGuide.connect.security')}</p>
        </div>
      </div>
    </section>
  )
}

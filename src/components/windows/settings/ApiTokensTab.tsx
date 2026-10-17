import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronDown, ChevronUp, Key, Plus, RefreshCw, Shield, ShieldAlert, Trash2, X } from "lucide-react";
import { listAPITokens, createAPIToken, deleteAPIToken, type APIToken, type CreateAPITokenPayload } from "@/api/apiTokens";
import { getMeV2 } from "@/api/auth";
import { CopyBlock } from "@/components/public/CopyBlock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { ListRowIcon, ListState, ListTable } from "@/components/ui/ListTable";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { alertLib } from "@/lib/alert";
import { formatDateTimeID } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";

type Expiry = CreateAPITokenPayload["expiresIn"];

const EXPIRY_VALUES: { value: string; expiresIn: Expiry; key: string }[] = [
  { value: "30d", expiresIn: "30d", key: "settings.tokens.expiry.30d" },
  { value: "7d", expiresIn: "7d", key: "settings.tokens.expiry.7d" },
  { value: "90d", expiresIn: "90d", key: "settings.tokens.expiry.90d" },
  { value: "1y", expiresIn: "1y", key: "settings.tokens.expiry.1y" },
  { value: "never", expiresIn: null, key: "settings.tokens.expiry.never" },
];

const DAY = 24 * 60 * 60 * 1000;

// A regenerated token keeps the lifetime of the one it replaces
function lifetimeOf(token: APIToken): Expiry {
  if (!token.expiresAt) return null;
  const days = Math.round((new Date(token.expiresAt).getTime() - new Date(token.createdAt).getTime()) / DAY);
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  return "1y";
}

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : fallback);

// API tokens for MCP agents and scripts: make one, see it once, connect a client, revoke it
export function ApiTokensTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tokenName, setTokenName] = useState("");
  const [expiry, setExpiry] = useState("30d");
  const [created, setCreated] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const { data: me } = useQuery({ queryKey: ["auth", "me"], queryFn: getMeV2 });
  const tokensQuery = useQuery({ queryKey: ["apiTokens"], queryFn: listAPITokens });
  const tokens = tokensQuery.data ?? [];
  const role = me?.role || "user";
  const privileged = role === "superadmin" || role === "admin";

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["apiTokens"] });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAPITokenPayload) => createAPIToken(payload),
    onSuccess: (data) => {
      setCreated(data.token);
      setTokenName("");
      void refresh();
      alertLib.fire(t("settings.tokens.createdTitle"), t("settings.tokens.createdMessage"), "success", "settings");
    },
    onError: (e) => alertLib.fire(t("settings.tokens.createFailed"), apiError(e, t("settings.tokens.createFailed")), "error", "settings"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => deleteAPIToken(id),
    onSuccess: () => {
      void refresh();
      alertLib.fire(t("settings.tokens.revokedTitle"), t("settings.tokens.revokedMessage"), "success", "settings");
    },
    onError: (e) => alertLib.fire(t("settings.tokens.revokeFailed"), apiError(e, t("settings.tokens.revokeFailed")), "error", "settings"),
  });

  // the new token is made first: if that fails, the old one is still there
  const regenerateMutation = useMutation({
    mutationFn: async (token: APIToken) => {
      const made = await createAPIToken({ name: token.name, expiresIn: lifetimeOf(token) });
      await deleteAPIToken(token.id);
      return made;
    },
    onSuccess: (data) => {
      setCreated(data.token);
      void refresh();
      alertLib.fire(t("settings.tokens.createdTitle"), t("settings.tokens.createdMessage"), "success", "settings");
    },
    onError: (e) => alertLib.fire(t("settings.tokens.regenerateFailed"), apiError(e, t("settings.tokens.regenerateFailed")), "error", "settings"),
  });

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const name = tokenName.trim();
    if (!name) return;
    createMutation.mutate({ name, expiresIn: EXPIRY_VALUES.find((item) => item.value === expiry)?.expiresIn ?? null });
  };

  const revoke = async (token: APIToken) => {
    const ok = await alertLib.confirm(t("settings.tokens.revokeQuestion"), t("settings.tokens.revokeMessage", { name: token.name, prefix: token.tokenPrefix }), t("settings.tokens.revoke"), t("common.cancel"), "warning", "settings");
    if (ok) revokeMutation.mutate(token.id);
  };

  const regenerate = async (token: APIToken) => {
    const ok = await alertLib.confirm(t("settings.tokens.regenerateQuestion"), t("settings.tokens.regenerateMessage", { name: token.name, prefix: token.tokenPrefix }), t("settings.tokens.regenerate"), t("common.cancel"), "warning", "settings");
    if (ok) regenerateMutation.mutate(token);
  };

  const origin = window.location.origin;
  const value = created || t("settings.tokens.placeholder");
  const mcpUrl = `${origin}/mcp?key=${value}`;
  const stdio = { command: "/usr/local/bin/reneo-agent", args: ["mcp", "--token", value] };
  const desktopConfig = JSON.stringify({ mcpServers: { reneo: stdio } }, null, 2);
  const sshConfig = JSON.stringify({ mcpServers: { "reneo-remote": { command: "ssh", args: [t("settings.tokens.serverIp"), `/usr/local/bin/reneo-agent mcp --token ${value}`] } } }, null, 2);

  return (
    <div id="api-tokens-container" className="space-y-3.5">
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3.5">
        {privileged ? <ShieldAlert size={16} className="mt-0.5 shrink-0 text-[var(--panel-warning-text)]" /> : <Shield size={16} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" />}
        <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{privileged ? t("settings.tokens.scopePrivileged", { role }) : t("settings.tokens.scopeUser")}</p>
      </div>

      {created ? (
        <section className="panel-shell-card space-y-3 p-4" role="status">
          <SectionHeader
            icon={<Key />}
            tone="success"
            title={t("settings.tokens.newTitle")}
            subtitle={t("settings.tokens.newHint")}
            actions={
              <Button variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setCreated(null)}>
                {t("common.close")}
              </Button>
            }
          />
          <CopyBlock text={created} wrap />
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyBlock label="Hermes Agent" text={`hermes mcp add RENEO --url "${mcpUrl}"`} wrap />
            <CopyBlock label="OpenClaw" text={`openclaw mcp add RENEO --transport streamable-http --url "${mcpUrl}"`} wrap />
          </div>
        </section>
      ) : null}

      <section className="panel-shell-card space-y-3 p-4">
        <SectionHeader icon={<Plus />} title={t("settings.tokens.createTitle")} subtitle={t("settings.tokens.createHint")} />
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end" onSubmit={create}>
          <Field label={t("settings.tokens.name")} htmlFor="api-token-name">
            <TextInput id="api-token-name" value={tokenName} maxLength={60} autoComplete="off" placeholder={t("settings.tokens.namePlaceholder")} onChange={(e) => setTokenName(e.target.value)} />
          </Field>
          <Field label={t("settings.tokens.expiry")}>
            <Select value={expiry} onChange={setExpiry} options={EXPIRY_VALUES.map((item) => ({ value: item.value, label: t(item.key) }))} />
          </Field>
          <Button type="submit" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} loading={createMutation.isPending} disabled={!tokenName.trim()}>
            {t("settings.tokens.generate")}
          </Button>
        </form>
      </section>

      <section id="active-tokens-section" className="space-y-2">
        <p className="panel-section-label">{t("settings.tokens.active")}</p>
        <div className="overflow-hidden rounded-xl border border-[var(--win-border)]">
          <ListTable
            variant="tokens"
            empty={tokensQuery.isLoading || tokensQuery.isError || tokens.length === 0}
            columns={[
              { label: t("settings.tokens.col.name") },
              { label: t("settings.tokens.col.created") },
              { label: t("settings.tokens.col.lastUsed") },
              { label: t("settings.tokens.col.expires") },
              { label: t("settings.tokens.col.actions"), actions: true },
            ]}
          >
            <ListState
              loading={tokensQuery.isLoading}
              error={tokensQuery.isError}
              errorTitle={t("settings.tokens.loadFailed")}
              errorHint={t("settings.tokens.loadFailedHint")}
              loadingText={t("settings.tokens.loading")}
              empty={tokens.length === 0}
              emptyIcon={<Key />}
              emptyTitle={t("settings.tokens.empty")}
              emptyHint={t("settings.tokens.emptyHint")}
            >
              {tokens.map((token) => {
                const expired = !!token.expiresAt && new Date(token.expiresAt).getTime() < Date.now();
                const busy = (revokeMutation.isPending && revokeMutation.variables === token.id) || (regenerateMutation.isPending && regenerateMutation.variables?.id === token.id);
                return (
                  <div key={token.id} className="docker-row">
                    <div className="docker-row__app">
                      <ListRowIcon><Key className="h-3.5 w-3.5" /></ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-app-name" title={token.name}>{token.name}</span>
                        <span className="docker-row__sub panel-mono">{token.tokenPrefix}...</span>
                        <span className="docker-row__meta">{`${token.tokenPrefix}... \u00b7 ${token.expiresAt ? formatDateTimeID(token.expiresAt) : t("settings.tokens.never")}`}</span>
                      </div>
                    </div>
                    <div className="docker-cell">{formatDateTimeID(token.createdAt)}</div>
                    <div className="docker-cell">{token.lastUsedAt ? formatDateTimeID(token.lastUsedAt) : t("settings.tokens.neverUsed")}</div>
                    <div className="docker-cell--keep">
                      {expired ? (
                        <Badge tone="danger">{t("settings.tokens.expired")}</Badge>
                      ) : (
                        <span className="text-[0.75rem] text-[var(--text-secondary)]">{token.expiresAt ? formatDateTimeID(token.expiresAt) : t("settings.tokens.never")}</span>
                      )}
                    </div>
                    <div className="docker-action-btns">
                      <button type="button" className="docker-act-btn" title={t("settings.tokens.regenerate")} aria-label={t("settings.tokens.regenerate")} disabled={busy} onClick={() => void regenerate(token)}>
                        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="docker-act-btn docker-act-btn--danger" title={t("settings.tokens.revoke")} aria-label={t("settings.tokens.revoke")} disabled={busy} onClick={() => void revoke(token)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </ListState>
          </ListTable>
        </div>
        <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t("settings.tokens.hashNote")}</p>
      </section>

      <section className="panel-shell-card space-y-3 p-4">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={showGuide} onClick={() => setShowGuide((v) => !v)}>
          <SectionHeader icon={<Bot />} title={t("settings.tokens.guideTitle")} subtitle={t("settings.tokens.guideHint")} />
          {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showGuide ? (
          <div className="space-y-3">
            {!created ? <p className="text-[0.75rem] text-[var(--text-secondary)]">{t("settings.tokens.guidePlaceholder")}</p> : null}
            <CopyBlock label={t("settings.tokens.guideClaude")} text={desktopConfig} />
            <CopyBlock label={t("settings.tokens.guideRemote")} text={sshConfig} />
            <CopyBlock label={t("settings.tokens.guideHttp")} text={mcpUrl} wrap />
          </div>
        ) : null}
      </section>
    </div>
  );
}

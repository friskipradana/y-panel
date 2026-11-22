import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Key, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { listAPITokens, createAPIToken, deleteAPIToken, type APIToken, type CreateAPITokenPayload } from "@/api/apiTokens";
import { getMeV2 } from "@/api/auth";
import { CopyBlock } from "@/components/public/CopyBlock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { ListRowIcon, ListState, ListTable } from "@/components/ui/ListTable";
import { Select } from "@/components/ui/Select";
import { alertLib } from "@/lib/alert";
import { formatDateID, formatDateTimeID } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import { SettingsGroup } from "./SettingsPrimitives";

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
    <div id="api-tokens-container" className="space-y-3">
      {/* ── Token Baru (Success Banner) ── */}
      {created ? (
        <div className="panel-shell-card settings-card !p-3.5 !gap-3 border-[var(--panel-success-border,var(--win-border))] bg-[var(--panel-success-bg,var(--panel-surface))]" role="status">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Key className="h-4 w-4 text-[var(--panel-success-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                  {t("settings.tokens.newTitle")}
                </h2>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {t("settings.tokens.newHint")}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => setCreated(null)}
            >
              {t("common.close")}
            </Button>
          </div>

          <CopyBlock text={created} wrap />

          <div className="grid gap-2.5 sm:grid-cols-2">
            <CopyBlock label="Hermes Agent" text={`hermes mcp add RENEO --url "${mcpUrl}"`} wrap />
            <CopyBlock label="OpenClaw" text={`openclaw mcp add RENEO --transport streamable-http --url "${mcpUrl}"`} wrap />
          </div>
        </div>
      ) : null}

      {/* ── Group 1: Buat Token Baru ── */}
      <SettingsGroup
        title={t("settings.tokens.createTitle")}
        description={privileged ? t("settings.tokens.scopePrivileged", { role }) : t("settings.tokens.scopeUser")}
      >
        <form className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end" onSubmit={create}>
          <Field label={t("settings.tokens.name")} htmlFor="api-token-name">
            <TextInput
              id="api-token-name"
              value={tokenName}
              maxLength={60}
              autoComplete="off"
              placeholder={t("settings.tokens.namePlaceholder")}
              onChange={(e) => setTokenName(e.target.value)}
              className="!h-8 px-2.5 text-[12px]"
            />
          </Field>
          <Field label={t("settings.tokens.expiry")}>
            <Select
              id="api-token-expiry"
              value={expiry}
              onChange={setExpiry}
              buttonClassName="!h-8 text-[12px] px-2.5"
              options={EXPIRY_VALUES.map((item) => ({ value: item.value, label: t(item.key) }))}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            loading={createMutation.isPending}
            disabled={!tokenName.trim()}
            className="!h-8 px-3.5 text-[12px] shrink-0"
          >
            {t("settings.tokens.generate")}
          </Button>
        </form>
      </SettingsGroup>

      {/* ── Group 2: Token Aktif ── */}
      <SettingsGroup
        title={t("settings.tokens.active")}
        description={t("settings.tokens.hashNote")}
        action={tokens.length > 0 ? <Badge tone="neutral" size="sm">{tokens.length}</Badge> : null}
        cardClassName="!p-0"
      >
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
              const busy =
                (revokeMutation.isPending && revokeMutation.variables === token.id) ||
                (regenerateMutation.isPending && regenerateMutation.variables?.id === token.id);
              return (
                <div key={token.id} className="docker-row">
                  <div className="docker-row__app">
                    <ListRowIcon>
                      <Key className="h-3.5 w-3.5" />
                    </ListRowIcon>
                    <div className="docker-row__text">
                      <span className="docker-app-name" title={token.name}>
                        {token.name}
                      </span>
                      <span className="docker-row__sub panel-mono">{token.tokenPrefix}...</span>
                    </div>
                  </div>
                  <div className="docker-cell" title={formatDateTimeID(token.createdAt)}>
                    {formatDateID(token.createdAt)}
                  </div>
                  <div className="docker-cell" title={token.lastUsedAt ? formatDateTimeID(token.lastUsedAt) : undefined}>
                    {token.lastUsedAt ? formatDateID(token.lastUsedAt) : t("settings.tokens.neverUsed")}
                  </div>
                  <div className="docker-cell--keep">
                    {expired ? (
                      <Badge tone="danger">{t("settings.tokens.expired")}</Badge>
                    ) : (
                      <span
                        className="text-[0.75rem] text-[var(--text-secondary)]"
                        title={token.expiresAt ? formatDateTimeID(token.expiresAt) : undefined}
                      >
                        {token.expiresAt ? formatDateID(token.expiresAt) : t("settings.tokens.never")}
                      </span>
                    )}
                  </div>
                  <div className="docker-action-btns">
                    <button
                      type="button"
                      className="docker-act-btn docker-act-btn--restart"
                      title={t("settings.tokens.regenerate")}
                      aria-label={t("settings.tokens.regenerate")}
                      disabled={busy}
                      onClick={() => void regenerate(token)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="docker-act-btn docker-act-btn--danger"
                      title={t("settings.tokens.revoke")}
                      aria-label={t("settings.tokens.revoke")}
                      disabled={busy}
                      onClick={() => void revoke(token)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              );
            })}
          </ListState>
        </ListTable>
      </SettingsGroup>

      {/* ── Group 3: Hubungkan Klien MCP ── */}
      <SettingsGroup
        title={t("settings.tokens.guideTitle")}
        description={t("settings.tokens.guideHint")}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="!h-7 text-[11px]"
            icon={showGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            onClick={() => setShowGuide((v) => !v)}
          >
            {showGuide ? t("common.hide") || "Hide" : t("common.show") || "Show"}
          </Button>
        }
      >
        {showGuide ? (
          <div className="space-y-3 pt-1">
            {!created ? (
              <p className="text-[11px] text-[var(--text-muted)] italic">
                {t("settings.tokens.guidePlaceholder")}
              </p>
            ) : null}
            <CopyBlock label={t("settings.tokens.guideClaude")} text={desktopConfig} />
            <CopyBlock label={t("settings.tokens.guideRemote")} text={sshConfig} />
            <CopyBlock label={t("settings.tokens.guideHttp")} text={mcpUrl} wrap />
          </div>
        ) : (
          <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
            {t("settings.tokens.guideHint")}
          </p>
        )}
      </SettingsGroup>
    </div>
  );
}

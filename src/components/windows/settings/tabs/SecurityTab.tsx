import { Copy, Database, Key, LoaderCircle, LockKeyhole, RefreshCcw } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import type { SettingsTabKey } from "../constants";
import { FieldLabel } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"

export function SecurityTab({ host, setActiveTab }: { host: HostSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const {
    databaseQuery,
    dbResetResult,
    primaryPassword,
    setPrimaryPassword,
    primaryPasswordConfirm,
    setPrimaryPasswordConfirm,
    resetDatabaseMutation,
    resetPrimaryPasswordMutation,
    handleResetDatabase,
    handleResetPrimaryPassword,
  } = host;

  return (
    <div className="space-y-3.5">
      {/* Primary Account Password Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <SectionHeader
          icon={<LockKeyhole />}
          title={t("settings.primaryPasswordTitle")}
          subtitle={t("settings.primaryPasswordSubtitle")}
        />

        {/* Password Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel
              label={t("settings.newPassword")}
              hint={t("settings.minEightChars")}
            />
            <TextInput
              id="settings-primary-password"
              type="password"
              value={primaryPassword}
              onChange={(event) =>
                setPrimaryPassword(event.target.value)
              } className="h-[40px] px-3.5 text-[13px]"
              placeholder={t("settings.enterNewPassword")}
            />
          </div>
          <div>
            <FieldLabel
              label={t("settings.confirmPassword")}
              hint={t("settings.mustMatch")}
            />
            <TextInput
              id="settings-primary-password-confirm"
              type="password"
              value={primaryPasswordConfirm}
              onChange={(event) =>
                setPrimaryPasswordConfirm(event.target.value)
              } className="h-[40px] px-3.5 text-[13px]"
              placeholder={t("settings.repeatNewPassword")}
            />
          </div>
        </div>

        {/* Security Notice Alert */}
        <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex items-start gap-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          <LockKeyhole
            size={16}
            className="text-[var(--panel-primary-text)] shrink-0 mt-0.5"
          />
          <div>
            {t("settings.primaryPasswordSecurityNoteStart")}{" "}
            <strong className="text-[var(--win-text)] font-semibold">
              {t("settings.panelLoginPassword")}
            </strong>{" "}
            {t("settings.primaryPasswordSecurityNoteEnd")}
            {t("settings.linuxUserPasswordNote")}{" "}
            <code className="panel-mono text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--win-border)]">
              ui-panel
            </code>{" "}
            {t("settings.notChanged")}.
          </div>
        </div>

        {/* Action Row */}
        <div className="border-t border-[var(--win-border)] pt-3.5 flex justify-end">
          <Button
            id="settings-primary-password-save"
            type="button"
            onClick={handleResetPrimaryPassword}
            disabled={
              resetPrimaryPasswordMutation.isPending ||
              !primaryPassword.trim() ||
              !primaryPasswordConfirm.trim()
            } variant="primary" className="rounded-xl px-5 py-2 text-[13px] font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-all"
          >
            {resetPrimaryPasswordMutation.isPending ? (
              <LoaderCircle
                size={14}
                className="animate-spin"
              />
            ) : (
              <LockKeyhole size={14} />
            )}
            {resetPrimaryPasswordMutation.isPending
              ? t("settings.changingPassword")
              : t("settings.changePrimaryPassword")}
          </Button>
        </div>
      </div>

      {/* Database & Storage Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <SectionHeader
          icon={<Database />}
          title={t("settings.databaseTitle")}
          subtitle={t("settings.databaseSubtitle")}
        />

        {/* Status & Rows 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {t("settings.connection")}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  databaseQuery.data?.status.connected
                    ? "bg-[var(--panel-success-text)]"
                    : "bg-[var(--panel-danger-text)]"
                }`}
              />
              <span className="text-[13px] font-semibold text-[var(--win-text)]">
                {databaseQuery.data?.status.connected
                  ? t("common.connected")
                  : databaseQuery.data?.status.enabled
                    ? t("settings.unavailable")
                    : t("settings.disabled")}
              </span>
            </div>
            <div className="break-all text-[11.5px] font-mono text-[var(--text-secondary)] mt-0.5">
              {databaseQuery.data?.status.connected
                ? `${databaseQuery.data.status.user}@${databaseQuery.data.status.host}:${databaseQuery.data.status.port}`
                : databaseQuery.data?.status.lastError || "—"}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {t("settings.rows")}
            </div>
            <div className="text-[13px] font-semibold text-[var(--win-text)]">
              {databaseQuery.data
                ? t("settings.databaseRowsSummary", {
                    logs: databaseQuery.data.status.runtimeLogCount,
                    changelog:
                      databaseQuery.data.status.changelogCount,
                  })
                : "—"}
            </div>
            <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
              {t("settings.auditRows", {
                count:
                  databaseQuery.data?.status.settingsAuditCount ??
                  0,
              })}
            </div>
          </div>
        </div>

        {/* Reset DB Password Action Bar */}
        <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[var(--win-text)]">
                {t("settings.resetDatabasePassword")}
              </div>
              <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.resetDatabasePasswordHint")}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                id="settings-db-refresh"
                type="button"
                onClick={() => void databaseQuery.refetch()} variant="ghost" className="rounded-xl px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1.5"
              >
                <RefreshCcw
                  size={12}
                  className={
                    databaseQuery.isFetching ? "animate-spin" : ""
                  }
                />
                {t("common.refresh")}
              </Button>

              <Button
                id="settings-db-reset-password"
                type="button"
                onClick={handleResetDatabase}
                disabled={
                  resetDatabaseMutation.isPending ||
                  !databaseQuery.data?.status.enabled
                } variant="primary" className="rounded-xl px-3.5 py-1.5 text-[12px] font-semibold flex items-center gap-1.5"
              >
                {resetDatabaseMutation.isPending ? (
                  <LoaderCircle
                    size={13}
                    className="animate-spin"
                  />
                ) : (
                  <Database size={13} />
                )}
                {resetDatabaseMutation.isPending
                  ? t("settings.resetting")
                  : t("settings.resetPassword")}
              </Button>
            </div>
          </div>

          {dbResetResult ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {t("settings.database.newPasswordLabel")}
                </div>
                <code className="panel-mono break-all text-[13px] font-semibold text-emerald-300 mt-0.5 block">
                  {dbResetResult.password}
                </code>
              </div>
              <Button
                id="settings-db-copy-password"
                type="button"
                onClick={async () => {
                  try {
                    await copyTextToClipboard(
                      dbResetResult.password,
                    );
                    alertLib.fire(
                      t("settings.database.passwordCopiedTitle"),
                      t(
                        "settings.database.passwordCopiedMessage",
                      ),
                      "success",
                      "settings",
                    );
                  } catch (error: any) {
                    alertLib.fire(
                      t("settings.database.copyFailedTitle"),
                      error?.message ||
                        t("settings.database.copyFailedMessage"),
                      "error",
                      "settings",
                    );
                  }
                }} variant="ghost" className="rounded-lg px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1.5 text-emerald-300 hover:bg-emerald-500/20"
              >
                <Copy size={12} />
                {t("common.copy")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* API & MCP Tokens Shortcut Card */}
      <div className="panel-shell-card p-4 flex items-center justify-between gap-4 border border-[var(--panel-primary-text)]/20 bg-[var(--panel-primary-bg)]/20">
        <div className="flex items-center gap-3">
          <IconBadge size="md" tone="neutral">
            <Key />
          </IconBadge>
          <div>
            <div className="text-[13px] font-semibold text-[var(--win-text)]">
              API Key & Token MCP Server
            </div>
            <div className="text-[11.5px] text-[var(--text-secondary)]">
              Kelola token akses pribadi untuk Claude Desktop, Cursor, dan programmatic REST API.
            </div>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setActiveTab("api_tokens")} variant="primary" className="rounded-xl px-3.5 py-1.5 text-[12px] font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <span>{t("settings.security.openMcpTokens")}</span>
          <span>→</span>
        </Button>
      </div>
    </div>
  );
}

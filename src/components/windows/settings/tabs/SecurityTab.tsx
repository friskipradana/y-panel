import { Copy, Database, Key, LockKeyhole, RefreshCcw } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import type { SettingsTabKey } from "../constants";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconBadge } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button"
import { Field, TextInput } from "@/components/ui/Field"

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

  // told while typing, not after the agent refuses
  const tooShort = primaryPassword !== "" && primaryPassword.length < 8;
  const mismatch = primaryPasswordConfirm !== "" && primaryPassword !== primaryPasswordConfirm;

  return (
    <div className="space-y-3.5">
      {/* Primary Account Password Card */}
      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<LockKeyhole />}
          title={t("settings.primaryPasswordTitle")}
          subtitle={t("settings.primaryPasswordSubtitle")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("settings.newPassword")} htmlFor="settings-primary-password" hint={t("settings.minEightChars")} error={tooShort ? t("settings.passwordTooShort") : undefined}>
            <TextInput id="settings-primary-password" type="password" autoComplete="new-password" invalid={tooShort} value={primaryPassword} onChange={(event) => setPrimaryPassword(event.target.value)} placeholder={t("settings.enterNewPassword")} />
          </Field>
          <Field label={t("settings.confirmPassword")} htmlFor="settings-primary-password-confirm" hint={t("settings.mustMatch")} error={mismatch ? t("settings.passwordMismatch") : undefined}>
            <TextInput id="settings-primary-password-confirm" type="password" autoComplete="new-password" invalid={mismatch} value={primaryPasswordConfirm} onChange={(event) => setPrimaryPasswordConfirm(event.target.value)} placeholder={t("settings.repeatNewPassword")} />
          </Field>
        </div>

        {/* Security Notice Alert */}
        <div className="p-3 settings-inset flex items-start gap-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          <LockKeyhole
            size={16}
            className="text-[var(--panel-primary-text)] shrink-0 mt-0.5"
          />
          <div>
            {t("settings.primaryPasswordSecurityNoteStart")}{" "}
            <strong className="text-[var(--win-text)] font-semibold">
              {t("settings.panelLoginPassword")}
            </strong>{" "}
            {t("settings.primaryPasswordSecurityNoteEnd")}{" "}
            {t("settings.linuxUserPasswordNote")}{" "}
            <code className="panel-mono text-[11px] text-[var(--win-text)] bg-[var(--panel-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--win-border)]">
              reneo
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
              !primaryPasswordConfirm.trim() ||
              tooShort ||
              mismatch
            } variant="primary" icon={<LockKeyhole size={14} />} loading={resetPrimaryPasswordMutation.isPending}
          >
            {resetPrimaryPasswordMutation.isPending
              ? t("settings.changingPassword")
              : t("settings.changePrimaryPassword")}
          </Button>
        </div>
      </div>

      {/* Database & Storage Card */}
      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<Database />}
          title={t("settings.databaseTitle")}
          subtitle={t("settings.databaseSubtitle")}
        />

        {/* Status & Rows 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 settings-inset flex flex-col justify-between gap-1.5">
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

          <div className="p-3.5 settings-inset flex flex-col justify-between gap-1.5">
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
        <div className="p-3.5 settings-inset flex flex-col gap-3">
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
                onClick={() => void databaseQuery.refetch()} variant="ghost"
                icon={<RefreshCcw size={12} />} loading={databaseQuery.isFetching && !databaseQuery.isLoading}
              >
                {t("common.refresh")}
              </Button>

              <Button
                id="settings-db-reset-password"
                type="button"
                onClick={handleResetDatabase}
                disabled={
                  resetDatabaseMutation.isPending ||
                  !databaseQuery.data?.status.enabled
                } variant="primary" icon={<Database size={13} />} loading={resetDatabaseMutation.isPending}
              >
                {resetDatabaseMutation.isPending
                  ? t("settings.resetting")
                  : t("settings.resetPassword")}
              </Button>
            </div>
          </div>

          {dbResetResult ? (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--panel-success-text)]/30 bg-[var(--panel-success-bg)] p-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--panel-success-text)]">
                  {t("settings.database.newPasswordLabel")}
                </div>
                <code className="panel-mono mt-0.5 block break-all text-[13px] font-semibold text-[var(--win-text)]">
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
                }} variant="ghost" icon={<Copy size={12} />}
              >
                {t("common.copy")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel-shell-card settings-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconBadge size="md" tone="neutral">
            <Key />
          </IconBadge>
          <div>
            <div className="text-[13px] font-semibold text-[var(--win-text)]">
              {t("settings.security.tokensCardTitle")}
            </div>
            <div className="text-[11.5px] text-[var(--text-secondary)]">
              {t("settings.security.tokensCardHint")}
            </div>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setActiveTab("api_tokens")} variant="primary" className="shrink-0"
        >
          {t("settings.security.openMcpTokens")}
        </Button>
      </div>
    </div>
  );
}

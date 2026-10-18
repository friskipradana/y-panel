import { useState } from "react";
import { Copy, Database, Eye, EyeOff, Key, LockKeyhole, RefreshCcw, ShieldAlert } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import type { HostSettings } from "../hooks/useHostSettings";
import type { SettingsTabKey } from "../constants";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function SecurityTab({ host, setActiveTab }: { host: HostSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
    <div className="space-y-3">
      {/* ── Single Unified Security Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section 1: Password Akun Utama Reneo ── */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <LockKeyhole className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                  {t("settings.primaryPasswordTitle")}
                </h2>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {t("settings.primaryPasswordSubtitle")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={t("settings.newPassword")}
              htmlFor="settings-primary-password"
              hint={t("settings.minEightChars")}
              error={tooShort ? t("settings.passwordTooShort") : undefined}
            >
              <div className="relative">
                <TextInput
                  id="settings-primary-password"
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  invalid={tooShort}
                  value={primaryPassword}
                  onChange={(event) => setPrimaryPassword(event.target.value)}
                  placeholder={t("settings.enterNewPassword")}
                  className="!h-8 pl-2.5 pr-8 text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--win-text)] transition-colors p-0.5"
                  aria-label={showPass ? t("users.hidePassword") : t("users.showPassword")}
                >
                  {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </Field>

            <Field
              label={t("settings.confirmPassword")}
              htmlFor="settings-primary-password-confirm"
              hint={t("settings.mustMatch")}
              error={mismatch ? t("settings.passwordMismatch") : undefined}
            >
              <div className="relative">
                <TextInput
                  id="settings-primary-password-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  invalid={mismatch}
                  value={primaryPasswordConfirm}
                  onChange={(event) => setPrimaryPasswordConfirm(event.target.value)}
                  placeholder={t("settings.repeatNewPassword")}
                  className="!h-8 pl-2.5 pr-8 text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--win-text)] transition-colors p-0.5"
                  aria-label={showConfirm ? t("users.hidePassword") : t("users.showPassword")}
                >
                  {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </Field>
          </div>

          {/* Security Notice Alert */}
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--panel-info-border,var(--win-border))] bg-[var(--panel-info-bg,var(--panel-surface))]/60 px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--panel-info-text)]" strokeWidth={1.75} />
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
          <div className="flex justify-end pt-0.5">
            <Button
              id="settings-primary-password-save"
              type="button"
              size="sm"
              onClick={handleResetPrimaryPassword}
              disabled={
                resetPrimaryPasswordMutation.isPending ||
                !primaryPassword.trim() ||
                !primaryPasswordConfirm.trim() ||
                tooShort ||
                mismatch
              }
              variant="primary"
              icon={<LockKeyhole size={13} />}
              loading={resetPrimaryPasswordMutation.isPending}
              className="!h-8 px-3.5 text-[12px]"
            >
              {resetPrimaryPasswordMutation.isPending
                ? t("settings.changingPassword")
                : t("settings.changePrimaryPassword")}
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 2: Database & Storage Section ── */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <Database className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                  {t("settings.databaseTitle")}
                </h2>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {t("settings.databaseSubtitle")}
                </p>
              </div>
            </div>
          </div>

          {/* Status & Rows 2-Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3 flex flex-col justify-between gap-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
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
                <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                  {databaseQuery.data?.status.connected
                    ? t("common.connected")
                    : databaseQuery.data?.status.enabled
                      ? t("settings.unavailable")
                      : t("settings.disabled")}
                </span>
              </div>
              <div className="break-all text-[11px] panel-mono text-[var(--text-secondary)] mt-0.5">
                {databaseQuery.data?.status.connected
                  ? `${databaseQuery.data.status.user}@${databaseQuery.data.status.host}:${databaseQuery.data.status.port}`
                  : databaseQuery.data?.status.lastError || "—"}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/50 p-3 flex flex-col justify-between gap-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t("settings.rows")}
              </div>
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {databaseQuery.data
                  ? t("settings.databaseRowsSummary", {
                      logs: databaseQuery.data.status.runtimeLogCount,
                      changelog: databaseQuery.data.status.changelogCount,
                    })
                  : "—"}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.auditRows", {
                  count: databaseQuery.data?.status.settingsAuditCount ?? 0,
                })}
              </div>
            </div>
          </div>

          {/* Reset DB Password Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--win-text)]">
                {t("settings.resetDatabasePassword")}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {t("settings.resetDatabasePasswordHint")}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                id="settings-db-refresh"
                type="button"
                size="sm"
                onClick={() => void databaseQuery.refetch()}
                variant="ghost"
                icon={<RefreshCcw size={12} />}
                loading={databaseQuery.isFetching && !databaseQuery.isLoading}
                className="!h-8 text-[12px]"
              >
                {t("common.refresh")}
              </Button>

              <Button
                id="settings-db-reset-password"
                type="button"
                size="sm"
                onClick={handleResetDatabase}
                disabled={
                  resetDatabaseMutation.isPending ||
                  !databaseQuery.data?.status.enabled
                }
                variant="primary"
                icon={<Database size={13} />}
                loading={resetDatabaseMutation.isPending}
                className="!h-8 px-3.5 text-[12px]"
              >
                {resetDatabaseMutation.isPending
                  ? t("settings.resetting")
                  : t("settings.resetPassword")}
              </Button>
            </div>
          </div>

          {/* New DB Password Result Banner */}
          {dbResetResult ? (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[var(--panel-success-border,var(--win-border))] bg-[var(--panel-success-bg,var(--panel-surface))] p-3">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--panel-success-text)]">
                  {t("settings.database.newPasswordLabel")}
                </div>
                <code className="panel-mono mt-0.5 block break-all text-[12.5px] font-semibold text-[var(--win-text)]">
                  {dbResetResult.password}
                </code>
              </div>
              <Button
                id="settings-db-copy-password"
                type="button"
                size="sm"
                onClick={async () => {
                  try {
                    await copyTextToClipboard(dbResetResult.password);
                    alertLib.fire(
                      t("settings.database.passwordCopiedTitle"),
                      t("settings.database.passwordCopiedMessage"),
                      "success",
                      "settings"
                    );
                  } catch (error: any) {
                    alertLib.fire(
                      t("settings.database.copyFailedTitle"),
                      error?.message || t("settings.database.copyFailedMessage"),
                      "error",
                      "settings"
                    );
                  }
                }}
                variant="ghost"
                icon={<Copy size={12} />}
                className="!h-8 text-[12px]"
              >
                {t("common.copy")}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 3: Tokens Navigation Row ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Key className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                {t("settings.security.tokensCardTitle")}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {t("settings.security.tokensCardHint")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setActiveTab("api_tokens")}
            variant="default"
            size="sm"
            className="!h-8 px-3.5 text-[12px] shrink-0"
          >
            {t("settings.security.openMcpTokens")}
          </Button>
        </div>
      </div>
    </div>
  );
}

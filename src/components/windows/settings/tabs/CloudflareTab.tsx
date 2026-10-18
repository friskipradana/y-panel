import { useState } from "react";
import { BadgeCheck, ChevronDown, ChevronUp, Cloud, Copy, Eye, EyeOff, LoaderCircle, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CloudflareTokenGuide } from "@/components/cloudflare/CloudflareTokenGuide";
import { useI18n } from "@/lib/i18n";
import type { CloudflareSettings } from "../hooks/useCloudflareSettings";
import { FieldLabel } from "../SettingsPrimitives";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { IconBadge } from "@/components/ui/IconBadge";
import { ErrorState } from "@/components/ui/states";
import { TextInput } from "@/components/ui/Field";

export function CloudflareTab({ cloudflare }: { cloudflare: CloudflareSettings }) {
  const { t } = useI18n();
  const [showGuide, setShowGuide] = useState(false);
  const {
    cfForm,
    setCfForm,
    showCfToken,
    setShowCfToken,
    cfQuery,
    cf,
    saveCFMut,
    verifyCFMut,
    deleteCFMut,
    handleDeleteCloudflare,
  } = cloudflare;

  return (
    <div className="space-y-3">
      {/* ── Single Unified Cloudflare Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* ── Section Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Cloud className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                {t("settings.cloudflare.cardTitle")}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {t("settings.cloudflare.cardSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {cfQuery.isError ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[220px] my-auto">
            <ErrorState
              className="max-w-sm w-full"
              title={t("settings.cloudflare.loadFailed")}
              hint={t("settings.cloudflare.loadFailedHint")}
              action={
                <Button variant="primary" size="sm" loading={cfQuery.isFetching} onClick={() => void cfQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          </div>
        ) : cfQuery.isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] my-auto text-[13px] text-[var(--text-secondary)] gap-2">
            <LoaderCircle
              size={18}
              className="animate-spin text-[var(--panel-primary-text)]"
            />
            <span>{t("settings.cloudflare.loading")}</span>
          </div>
        ) : cf?.configured ? (
          <div className="space-y-3">
            {/* Status Connection Row */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconBadge size="lg" tone="primary">
                  <Cloud size={16} strokeWidth={1.75} />
                </IconBadge>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--win-text)] leading-tight">
                    {t("settings.cloudflare.accountConnected")}
                  </div>
                  <div className="text-[10.5px] text-[var(--text-secondary)] mt-0.5">
                    {t("settings.cloudflare.connectionStatus")}
                  </div>
                </div>
              </div>
              <Badge tone={cf.status === "active" ? "success" : cf.status === "invalid" ? "danger" : "warning"} dot>
                {t(cf.status === "active" ? "settings.cloudflare.statusActive" : cf.status === "invalid" ? "settings.cloudflare.statusInvalid" : "settings.cloudflare.statusUnverified")}
              </Badge>
            </div>

            {/* Credential Details List */}
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--win-content-bg)] divide-y divide-[var(--win-border)]/50 text-[12px] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-[var(--text-secondary)] text-[11.5px]">Account ID</span>
                <div className="flex items-center gap-1.5">
                  <code className="panel-mono font-semibold text-[var(--win-text)] text-[11.5px]">
                    {cf.accountId || "—"}
                  </code>
                  {cf.accountId && (
                    <IconButton
                      type="button"
                      label={t("common.copy")}
                      onClick={() => {
                        const accId = cf.accountId;
                        if (accId) {
                          void navigator.clipboard.writeText(accId);
                          toast.success(t("common.copied"));
                        }
                      }}
                      className="!h-5 !w-5 text-[var(--text-muted)] hover:text-[var(--win-text)]"
                    >
                      <Copy size={11} />
                    </IconButton>
                  )}
                </div>
              </div>
              {cf.zoneId && (
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-[var(--text-secondary)] text-[11.5px]">Zone ID</span>
                  <code className="panel-mono text-[var(--win-text)] text-[11.5px]">
                    {cf.zoneId}
                  </code>
                </div>
              )}
              {cf.baseDomain && (
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-[var(--text-secondary)] text-[11.5px]">Base Domain</span>
                  <code className="panel-mono text-[var(--win-text)] text-[11.5px]">
                    {cf.baseDomain}
                  </code>
                </div>
              )}
              {cf.verifiedAt && (
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-[var(--text-secondary)] text-[11.5px]">{t("settings.cloudflare.lastVerified")}</span>
                  <span className="panel-mono text-[var(--win-text)] text-[11.5px]">
                    {new Date(cf.verifiedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="!h-8 text-[12px]"
                  icon={<BadgeCheck className="h-3.5 w-3.5" />}
                  loading={verifyCFMut.isPending}
                  onClick={() => verifyCFMut.mutate()}
                >
                  {verifyCFMut.isPending ? t("settings.cloudflare.verifying") : t("settings.cloudflare.verifyAgain")}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="!h-8 text-[12px]"
                  icon={showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  aria-expanded={showGuide}
                  onClick={() => setShowGuide((open) => !open)}
                >
                  {showGuide ? t("cfguide.hide") : t("cfguide.show")}
                </Button>
              </div>

              <Button
                type="button"
                variant="danger-soft"
                size="sm"
                className="!h-8 text-[12px]"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                loading={deleteCFMut.isPending}
                onClick={handleDeleteCloudflare}
              >
                {t("settings.cloudflare.deleteCredentials")}
              </Button>
            </div>

            {/* Collapsible Token Guide */}
            {showGuide && (
              <div className="pt-2">
                <CloudflareTokenGuide />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium text-[var(--win-text)]">
                {t("settings.cloudflare.hintPermissions")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="!h-7 text-[11px]"
                icon={showGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                onClick={() => setShowGuide((v) => !v)}
              >
                {showGuide ? t("cfguide.hide") : t("cfguide.show")}
              </Button>
            </div>

            {showGuide && <CloudflareTokenGuide />}

            <div className="space-y-3">
              <div>
                <FieldLabel
                  label={t("settings.cloudflare.apiTokenRequired")}
                  hint={t("settings.cloudflare.hintPermissions")}
                />
                <div className="relative">
                  <TextInput
                    type={showCfToken ? "text" : "password"}
                    placeholder={`${t("settings.cloudflare.examplePrefix")}: vL_dF83...`}
                    value={cfForm.apiToken}
                    onChange={(e) =>
                      setCfForm((f) => ({
                        ...f,
                        apiToken: e.target.value,
                      }))
                    }
                    mono
                    className="!h-8 px-2.5 pr-9 text-[12px]"
                  />
                  <IconButton
                    type="button"
                    className="absolute right-1.5 top-1/2 h-6 w-6 -translate-y-1/2"
                    label={showCfToken ? t("settings.hideKey") : t("settings.showKey")}
                    onClick={() => setShowCfToken((v) => !v)}
                  >
                    {showCfToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </IconButton>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <FieldLabel
                    label={t("settings.cloudflare.accountIdRequired")}
                    hint={t("settings.cloudflare.hintAccount")}
                  />
                  <TextInput
                    value={cfForm.accountId}
                    onChange={(e) =>
                      setCfForm((f) => ({
                        ...f,
                        accountId: e.target.value,
                      }))
                    }
                    placeholder={`${t("settings.cloudflare.examplePrefix")}: 9a8b7c6d...`}
                    mono
                    className="!h-8 px-2.5 text-[12px]"
                  />
                </div>

                <div>
                  <FieldLabel
                    label={t("settings.cloudflare.zoneIdOptional")}
                    hint={t("settings.cloudflare.hintDomain")}
                  />
                  <TextInput
                    value={cfForm.zoneId}
                    onChange={(e) =>
                      setCfForm((f) => ({
                        ...f,
                        zoneId: e.target.value,
                      }))
                    }
                    placeholder={`${t("settings.cloudflare.examplePrefix")}: 1a2b3c4d...`}
                    mono
                    className="!h-8 px-2.5 text-[12px]"
                  />
                </div>

                <div>
                  <FieldLabel
                    label={t("settings.cloudflare.baseDomainOptional")}
                    hint={t("settings.cloudflare.hintExample")}
                  />
                  <TextInput
                    value={cfForm.baseDomain}
                    onChange={(e) =>
                      setCfForm((f) => ({
                        ...f,
                        baseDomain: e.target.value,
                      }))
                    }
                    placeholder={t("settings.cloudflare.baseDomainPlaceholder")}
                    mono
                    className="!h-8 px-2.5 text-[12px]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--win-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[11.5px] text-[var(--text-secondary)]">
                {t("settings.cloudflare.validatedOnSave")}
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="!h-8 text-[12px]"
                icon={<Save className="h-3.5 w-3.5" />}
                loading={saveCFMut.isPending}
                disabled={!cfForm.apiToken.trim() || !cfForm.accountId.trim()}
                onClick={() => saveCFMut.mutate(cfForm)}
              >
                {saveCFMut.isPending ? t("settings.cloudflare.connecting") : t("settings.cloudflare.saveAndVerify")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

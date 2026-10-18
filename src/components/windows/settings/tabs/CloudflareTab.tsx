import { useState } from "react";
import { BadgeCheck, Cloud, Eye, EyeOff, LoaderCircle, Save, Trash2 } from "lucide-react";
import { CloudflareTokenGuide } from "@/components/cloudflare/CloudflareTokenGuide";
import { useI18n } from "@/lib/i18n";
import type { CloudflareSettings } from "../hooks/useCloudflareSettings";
import { FieldLabel } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { IconButton } from "@/components/ui/IconButton"
import { ErrorState } from "@/components/ui/states"
import { TextInput } from "@/components/ui/Field"

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
    <div className="space-y-4">
      <div className="panel-shell-card settings-card">
        <SectionHeader
          icon={<Cloud />}
          title={t("settings.cloudflare.cardTitle")}
          subtitle={t("settings.cloudflare.cardSubtitle")}
        />

        {cfQuery.isError ? (
          <ErrorState
            title={t("settings.cloudflare.loadFailed")}
            hint={t("settings.cloudflare.loadFailedHint")}
            action={
              <Button variant="ghost" loading={cfQuery.isFetching} onClick={() => void cfQuery.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : cfQuery.isLoading ? (
          <div className="py-12 text-center text-[13px] text-[var(--text-secondary)] flex items-center justify-center gap-2">
            <LoaderCircle
              size={16}
              className="animate-spin text-[var(--panel-primary-text)]"
            />
            <span>{t("settings.cloudflare.loading")}</span>
          </div>
        ) : cf?.configured ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 settings-inset p-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {t("settings.cloudflare.connectionStatus")}
                </div>
                <div className="mt-1 text-[14px] font-bold text-[var(--win-text)] flex items-center gap-2">
                  <Cloud
                    size={16}
                    className="text-[var(--panel-primary-text)]"
                  />
                  {t("settings.cloudflare.accountConnected")}
                </div>
              </div>
              <Badge tone={cf.status === "active" ? "success" : cf.status === "invalid" ? "danger" : "warning"} dot>
                {t(cf.status === "active" ? "settings.cloudflare.statusActive" : cf.status === "invalid" ? "settings.cloudflare.statusInvalid" : "settings.cloudflare.statusUnverified")}
              </Badge>
            </div>

            <div className="space-y-2.5 settings-inset p-4 text-[12.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[var(--text-secondary)]">
                  Account ID
                </span>
                <code className="panel-mono text-[var(--win-text)] font-semibold">
                  {cf.accountId || "—"}
                </code>
              </div>
              {cf.zoneId && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)]/50 pt-2">
                  <span className="text-[var(--text-secondary)]">
                    Zone ID
                  </span>
                  <code className="panel-mono text-[var(--win-text)]">
                    {cf.zoneId}
                  </code>
                </div>
              )}
              {cf.baseDomain && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)]/50 pt-2">
                  <span className="text-[var(--text-secondary)]">
                    Base Domain
                  </span>
                  <code className="panel-mono text-[var(--win-text)]">
                    {cf.baseDomain}
                  </code>
                </div>
              )}
              {cf.verifiedAt && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)]/50 pt-2">
                  <span className="text-[var(--text-secondary)]">
                    {t("settings.cloudflare.lastVerified")}
                  </span>
                  <span className="text-[var(--win-text)]">
                    {new Date(cf.verifiedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="button" variant="primary" icon={<BadgeCheck className="h-3.5 w-3.5" />} loading={verifyCFMut.isPending} onClick={() => verifyCFMut.mutate()}>
                {verifyCFMut.isPending ? t("settings.cloudflare.verifying") : t("settings.cloudflare.verifyAgain")}
              </Button>

              <Button type="button" variant="danger-soft" className="ml-auto" icon={<Trash2 className="h-3.5 w-3.5" />} loading={deleteCFMut.isPending} onClick={handleDeleteCloudflare}>
                {t("settings.cloudflare.deleteCredentials")}
              </Button>
            </div>

            <div className="space-y-3">
              <Button type="button" variant="ghost" aria-expanded={showGuide} onClick={() => setShowGuide((open) => !open)}>
                {showGuide ? t("cfguide.hide") : t("cfguide.show")}
              </Button>
              {showGuide ? <CloudflareTokenGuide /> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <CloudflareTokenGuide />

            <div className="grid grid-cols-1 gap-4">
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
                    } mono className="h-[42px] px-3.5 pr-10 text-[13px]"
                  />
                  <IconButton
                    type="button"
                    className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                    label={showCfToken ? t("settings.hideKey") : t("settings.showKey")}
                    onClick={() => setShowCfToken((v) => !v)}
                  >
                    {showCfToken ? <EyeOff size={15} /> : <Eye size={15} />}
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
                    placeholder={`${t("settings.cloudflare.examplePrefix")}: 9a8b7c6d...`} mono className="h-[42px] px-3.5 text-[13px]"
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
                    placeholder={`${t("settings.cloudflare.examplePrefix")}: 1a2b3c4d...`} mono className="h-[42px] px-3.5 text-[13px]"
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
                    placeholder={t("settings.cloudflare.baseDomainPlaceholder")} mono className="h-[42px] px-3.5 text-[13px]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--win-border)] flex items-center justify-between">
              <span className="text-[12px] text-[var(--text-secondary)]">
                {t("settings.cloudflare.validatedOnSave")}
              </span>
              <Button
                type="button"
                variant="primary"
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

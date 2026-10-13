import { AlertTriangle, BadgeCheck, CheckCircle2, Cloud, Eye, EyeOff, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { CloudflareSettings } from "../hooks/useCloudflareSettings";
import { FieldLabel } from "../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"

export function CloudflareTab({ cloudflare }: { cloudflare: CloudflareSettings }) {
  const { t } = useI18n();
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
      <div className="panel-shell-card p-5">
        <SectionHeader
          icon={<Cloud />}
          title={t("settings.cloudflare.cardTitle")}
          subtitle={t("settings.cloudflare.cardSubtitle")}
        />

        {cfQuery.isLoading ? (
          <div className="py-12 text-center text-[13px] text-[var(--text-secondary)] flex items-center justify-center gap-2">
            <LoaderCircle
              size={16}
              className="animate-spin text-[var(--panel-primary-text)]"
            />
            <span>{t("settings.cloudflare.loading")}</span>
          </div>
        ) : cf?.configured ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
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
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
                  cf.status === "active"
                    ? "bg-[var(--panel-success-bg)] text-[var(--panel-success-text)]"
                    : cf.status === "invalid"
                      ? "bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)]"
                      : "bg-[var(--panel-warning-bg)] text-[var(--panel-warning-text)]"
                }`}
              >
                {cf.status === "active" ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <AlertTriangle size={13} />
                )}
                {cf.status === "active"
                  ? "Terverifikasi"
                  : cf.status === "invalid"
                    ? "Token Tidak Valid"
                    : "Belum Diverifikasi"}
              </span>
            </div>

            <div className="space-y-2.5 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 text-[12.5px]">
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
              <Button
                type="button"
                onClick={() => verifyCFMut.mutate()}
                disabled={verifyCFMut.isPending} variant="primary" className="rounded-xl px-4 py-2.5 text-[13px] flex items-center gap-2"
              >
                {verifyCFMut.isPending ? (
                  <LoaderCircle
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <BadgeCheck size={14} />
                )}
                {verifyCFMut.isPending
                  ? "Memverifikasi..."
                  : "Verifikasi Ulang Token"}
              </Button>

              <Button
                type="button"
                onClick={handleDeleteCloudflare}
                disabled={deleteCFMut.isPending} className="border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-bg)] rounded-xl px-4 py-2.5 text-[13px] flex items-center gap-2 ml-auto"
              >
                <Trash2 size={14} />
                {t("settings.cloudflare.deleteCredentials")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Permission Guidance Banner */}
            <div className="rounded-2xl border border-[var(--panel-primary-text)]/20 bg-[var(--panel-primary-bg)] p-4 text-[12px] leading-relaxed">
              <div className="flex items-start gap-3">
                <Cloud className="h-5 w-5 text-[var(--panel-primary-text)] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[var(--win-text)] text-[13px]">
                    {t("settings.cloudflare.permissionGuideTitle")}
                  </div>
                  <p className="mt-1 text-[var(--text-secondary)]">
                    {t("settings.cloudflare.permissionGuideBody")}
                  </p>
                  <ul className="list-disc pl-4 mt-2 space-y-1 font-medium text-[var(--panel-primary-text)]">
                    <li>Account → Cloudflare Tunnel → Edit</li>
                    <li>Zone → Zone → Edit & Read</li>
                    <li>Zone → DNS → Edit</li>
                  </ul>
                  <div className="mt-3">
                    <a
                      href="https://dash.cloudflare.com/profile/api-tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline underline-offset-2 text-[var(--panel-primary-text)] hover:brightness-110"
                    >
                      {t("settings.cloudflare.openDashboard")}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <FieldLabel
                  label={t("settings.cloudflare.apiTokenRequired")}
                  hint="Permissions: Tunnel & DNS"
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
                  <button
                    type="button"
                    onClick={() => setShowCfToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
                  >
                    {showCfToken ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <FieldLabel
                    label={t("settings.cloudflare.accountIdRequired")}
                    hint="Account overview"
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
                    hint="Domain overview"
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
                    hint="contoh.com"
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
                onClick={() => saveCFMut.mutate(cfForm)}
                disabled={
                  saveCFMut.isPending ||
                  !cfForm.apiToken.trim() ||
                  !cfForm.accountId.trim()
                } variant="primary" className="rounded-xl px-5 py-2.5 text-[13px] flex items-center gap-2"
              >
                {saveCFMut.isPending ? (
                  <LoaderCircle
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={14} />
                )}
                {saveCFMut.isPending
                  ? "Menyimpan & Menghubungkan..."
                  : "Simpan & Verifikasi"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

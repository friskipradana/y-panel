import { CreditCard, Eye, EyeOff, Globe2, LoaderCircle, Save, Wifi, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { PaymentSettings } from "../hooks/usePaymentSettings";
import { IconBadge } from "@/components/ui/IconBadge";
import type { UiTone } from "@/components/ui/IconBadge";
import { Button } from "@/components/ui/Button"
import { LoadingState } from "@/components/ui/states"

export function PaymentTab({ payment }: { payment: PaymentSettings }) {
  const { t } = useI18n();
  const {
    paymentSettings,
    setPaymentSettings,
    originalPaymentSettings,
    showSecrets,
    setShowSecrets,
    paymentQuery,
    paymentSettingsList,
    paymentMutation,
    testGatewayMutation,
    handleSavePaymentSettings,
  } = payment;

  return (
    <div className="space-y-3.5">
      {/* Service Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] shadow-xs">
        <div className="flex items-center gap-3">
          <IconBadge size="md" tone="primary">
            <CreditCard />
          </IconBadge>
          <div>
            <div className="text-[13.5px] font-bold text-[var(--win-text)]">
              {t("settings.paymentGateway")}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 max-w-[540px]">
              {t("settings.paymentGatewaySubtitle")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-hover)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--win-text)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {paymentSettingsList.length}{" "}
              {t("settings.parameters") || "Parameters"}
            </span>
          </div>
        </div>
      </div>

      {paymentQuery.isLoading ? (
        <LoadingState className="min-h-[80px]">{t("settings.loadingPaymentGateway")}</LoadingState>
      ) : !paymentSettingsList.length ? (
        <div className="panel-empty min-h-[80px] text-[12px]">
          <span>{t("settings.noPaymentGatewayConfig")}</span>
        </div>
      ) : (
        <div className="space-y-3.5">
          {(() => {
            const settings = paymentSettingsList;
            const midtrans = settings.filter((s) =>
              s.key.startsWith("midtrans_"),
            );
            const xendit = settings.filter((s) =>
              s.key.startsWith("xendit_"),
            );
            const others = settings.filter(
              (s) =>
                !s.key.startsWith("midtrans_") &&
                !s.key.startsWith("xendit_"),
            );

            const renderGatewayGroup = (
              title: string,
              subtitle: string,
              icon: React.ReactNode,
              tone: UiTone,
              items: typeof settings,
            ) => (
              <div className="p-4 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] shadow-xs">
                <div className="flex items-center justify-between gap-2 pb-3 mb-3.5 border-b border-[var(--win-border)]">
                  <div className="flex items-center gap-2.5">
                    <IconBadge size="sm" tone={tone}>
                      {icon}
                    </IconBadge>
                    <div>
                      <div className="text-[13px] font-bold text-[var(--win-text)]">
                        {title}
                      </div>
                      <div className="text-[10.5px] text-[var(--text-secondary)]">
                        {subtitle}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {items.map((setting) => {
                    const isMasked =
                      setting.isSecret && !showSecrets[setting.key];
                    const isChanged =
                      paymentSettings[setting.key] !==
                      originalPaymentSettings[setting.key];
                    const isEnv =
                      setting.key.endsWith("_environment");

                    return (
                      <div
                        key={setting.key}
                        className={
                          isEnv
                            ? "col-span-1"
                            : "col-span-1 md:col-span-2"
                        }
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label
                            htmlFor={`payment-${setting.key}`}
                            className="text-[12px] font-semibold text-[var(--win-text)] flex items-center gap-1.5"
                          >
                            {setting.label}
                          </label>
                          <span className="font-mono text-[10.5px] text-[var(--text-secondary)] bg-[var(--panel-surface-hover)] px-2 py-0.5 rounded-md border border-[var(--win-border)]">
                            {setting.key}
                          </span>
                        </div>

                        <div className="relative">
                          {isEnv ? (
                            <select
                              id={`payment-${setting.key}`}
                              value={
                                paymentSettings[setting.key] ||
                                "sandbox"
                              }
                              onChange={(e) =>
                                setPaymentSettings((prev) => ({
                                  ...prev,
                                  [setting.key]: e.target.value,
                                }))
                              }
                              className={`panel-input h-[38px] px-3 text-[12px] font-medium ${
                                isChanged
                                  ? "ring-2 ring-[var(--panel-accent)]"
                                  : ""
                              }`}
                            >
                              <option value="sandbox">
                                sandbox
                              </option>
                              <option value="production">
                                production
                              </option>
                            </select>
                          ) : (
                            <>
                              <input
                                id={`payment-${setting.key}`}
                                type={
                                  isMasked ? "password" : "text"
                                }
                                value={
                                  paymentSettings[setting.key] || ""
                                }
                                onChange={(e) =>
                                  setPaymentSettings((prev) => ({
                                    ...prev,
                                    [setting.key]: e.target.value,
                                  }))
                                }
                                className={`panel-input panel-input--mono h-[38px] px-3.5 pr-10 text-[12px] ${
                                  isChanged
                                    ? "ring-2 ring-[var(--panel-accent)]"
                                    : ""
                                }`}
                                placeholder={
                                  setting.isSecret
                                    ? "••••••••••••••••••••••••"
                                    : setting.label
                                }
                              />
                              {setting.isSecret ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowSecrets((prev) => ({
                                      ...prev,
                                      [setting.key]:
                                        !prev[setting.key],
                                    }))
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-secondary)] hover:text-[var(--win-text)] rounded-md transition-colors"
                                  aria-label={
                                    isMasked
                                      ? t("settings.showKey")
                                      : t("settings.hideKey")
                                  }
                                >
                                  {isMasked ? (
                                    <Eye size={14} />
                                  ) : (
                                    <EyeOff size={14} />
                                  )}
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>

                        {setting.description && !isEnv && (
                          <div className="mt-1 text-[11px] text-[var(--text-secondary)] opacity-80">
                            {setting.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            return (
              <div className="space-y-3.5">
                {midtrans.length
                  ? renderGatewayGroup(
                      "Midtrans",
                      "Snap & Core Payment API",
                      <Zap />,
                      "warning",
                      midtrans,
                    )
                  : null}
                {xendit.length
                  ? renderGatewayGroup(
                      "Xendit",
                      "Invoice & XenPlatform API",
                      <Globe2 />,
                      "primary",
                      xendit,
                    )
                  : null}
                {others.length
                  ? renderGatewayGroup(
                      "Other Gateways",
                      "Additional Gateway Configurations",
                      <CreditCard />,
                      "info",
                      others,
                    )
                  : null}
              </div>
            );
          })()}

          {/* Action Bar */}
          <div className="p-3.5 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconBadge size="md" tone="neutral">
                <CreditCard />
              </IconBadge>
              <div>
                <div className="text-[13px] font-semibold text-[var(--win-text)]">
                  {t("settings.saveGatewayConfig")}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {t("settings.saveGatewayConfigHint")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                id="payment-test-gateway"
                type="button"
                onClick={() => testGatewayMutation.mutate()}
                disabled={testGatewayMutation.isPending} variant="ghost" className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold flex items-center gap-1.5"
              >
                {testGatewayMutation.isPending ? (
                  <LoaderCircle
                    size={13}
                    className="animate-spin"
                  />
                ) : (
                  <Wifi size={13} />
                )}
                {testGatewayMutation.isPending
                  ? t("settings.testing")
                  : t("settings.testConnection")}
              </Button>
              <Button
                id="payment-save-settings"
                type="button"
                onClick={handleSavePaymentSettings}
                disabled={paymentMutation.isPending} variant="primary" className="rounded-xl px-4 py-2 text-[12.5px] font-semibold flex items-center gap-1.5"
              >
                {paymentMutation.isPending ? (
                  <LoaderCircle
                    size={13}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={13} />
                )}
                {paymentMutation.isPending
                  ? t("settings.saving")
                  : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

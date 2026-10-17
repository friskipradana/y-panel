import { CreditCard, Eye, EyeOff, Globe2, Wifi, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { PaymentSettings } from "../hooks/usePaymentSettings";
import { SettingsSaveBar } from "../SettingsSaveBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { ErrorState, LoadingState } from "@/components/ui/states";
import type { UiTone } from "@/components/ui/IconBadge";

type Item = NonNullable<PaymentSettings["paymentQuery"]["data"]>["settings"][number];

interface Group {
  key: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  tone: UiTone;
  items: Item[];
}

// Payment gateways: one card each, with what is still missing and what is changed but not saved
export function PaymentTab({ payment }: { payment: PaymentSettings }) {
  const { t } = useI18n();
  const {
    paymentSettings,
    setPaymentSettings,
    changedKeys,
    showSecrets,
    setShowSecrets,
    paymentQuery,
    paymentSettingsList,
    paymentMutation,
    testGatewayMutation,
    handleSavePaymentSettings,
  } = payment;

  const all: Group[] = [
    { key: "midtrans", title: "Midtrans", subtitle: "Snap & Core Payment API", icon: <Zap />, tone: "warning" as const, items: paymentSettingsList.filter((s) => s.key.startsWith("midtrans_")) },
    { key: "xendit", title: "Xendit", subtitle: "Invoice & XenPlatform API", icon: <Globe2 />, tone: "primary" as const, items: paymentSettingsList.filter((s) => s.key.startsWith("xendit_")) },
    { key: "others", title: t("settings.payment.others"), subtitle: t("settings.payment.othersHint"), icon: <CreditCard />, tone: "info" as const, items: paymentSettingsList.filter((s) => !s.key.startsWith("midtrans_") && !s.key.startsWith("xendit_")) },
  ];
  const groups = all.filter((group) => group.items.length > 0);

  const dirty = changedKeys.length > 0;
  const set = (key: string, value: string) => setPaymentSettings((prev) => ({ ...prev, [key]: value }));

  if (paymentQuery.isLoading) return <LoadingState className="min-h-[80px]">{t("settings.loadingPaymentGateway")}</LoadingState>;
  if (paymentQuery.isError) {
    return (
      <ErrorState
        title={t("settings.payment.loadFailed")}
        hint={t("settings.payment.loadFailedHint")}
        action={
          <Button variant="ghost" loading={paymentQuery.isFetching} onClick={() => void paymentQuery.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (groups.length === 0) {
    return (
      <div className="panel-empty min-h-[80px] text-[12px]">
        <span>{t("settings.noPaymentGatewayConfig")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {groups.map((group) => {
        // a gateway is ready when every one of its fields has a value
        const complete = group.items.every((item) => (paymentSettings[item.key] ?? "").trim() !== "");
        const environment = group.items.find((item) => item.key.endsWith("_environment"));
        const live = environment && paymentSettings[environment.key] === "production";
        return (
          <section key={group.key} className="panel-shell-card flex flex-col gap-4 p-4">
            <SectionHeader
              icon={group.icon}
              title={group.title}
              subtitle={group.subtitle}
              tone={group.tone}
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  {environment ? <Badge tone={live ? "danger" : "neutral"}>{live ? t("settings.payment.production") : t("settings.payment.sandbox")}</Badge> : null}
                  <Badge tone={complete ? "success" : "warning"} dot>
                    {complete ? t("settings.payment.complete") : t("settings.payment.incomplete")}
                  </Badge>
                </div>
              }
            />

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {group.items.map((item) => {
                const isEnv = item.key.endsWith("_environment");
                const masked = item.isSecret && !showSecrets[item.key];
                const value = paymentSettings[item.key] ?? "";
                return (
                  <Field key={item.key} label={item.label} htmlFor={`payment-${item.key}`} hint={isEnv ? t("settings.payment.environmentHint") : item.description || undefined} className={isEnv ? "" : "md:col-span-2"}>
                    {isEnv ? (
                      <Select
                        id={`payment-${item.key}`}
                        value={value || "sandbox"}
                        onChange={(next) => set(item.key, next)}
                        options={[
                          { value: "sandbox", label: t("settings.payment.sandbox"), description: t("settings.payment.sandboxHint") },
                          { value: "production", label: t("settings.payment.production"), description: t("settings.payment.productionHint") },
                        ]}
                      />
                    ) : (
                      <div className="relative">
                        <TextInput
                          id={`payment-${item.key}`}
                          mono
                          type={masked ? "password" : "text"}
                          autoComplete="off"
                          value={value}
                          className="pr-10"
                          placeholder={item.isSecret ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : item.label}
                          onChange={(e) => set(item.key, e.target.value)}
                        />
                        {item.isSecret ? (
                          <IconButton
                            type="button"
                            className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2"
                            label={masked ? t("settings.showKey") : t("settings.hideKey")}
                            onClick={() => setShowSecrets((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                          >
                            {masked ? <Eye size={14} /> : <EyeOff size={14} />}
                          </IconButton>
                        ) : null}
                      </div>
                    )}
                  </Field>
                );
              })}
            </div>
          </section>
        );
      })}

      <SettingsSaveBar
        id="payment-save-settings"
        title={t("settings.saveGatewayConfig")}
        hint={dirty ? t("settings.payment.unsaved", { count: changedKeys.length }) : t("settings.saveGatewayConfigHint")}
        dirty={dirty}
        pending={paymentMutation.isPending}
        onSave={handleSavePaymentSettings}
        saveLabel={t("common.save")}
        pendingLabel={t("settings.saving")}
        extra={
          <Button id="payment-test-gateway" type="button" variant="ghost" icon={<Wifi className="h-3.5 w-3.5" />} loading={testGatewayMutation.isPending} disabled={dirty} title={dirty ? t("settings.payment.saveBeforeTest") : undefined} onClick={() => testGatewayMutation.mutate()}>
            {testGatewayMutation.isPending ? t("settings.testing") : t("settings.testConnection")}
          </Button>
        }
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getPaymentSettings, testPaymentGateway, updatePaymentSettings } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import { type UpdatePaymentSettingsPayload } from "@/types";

export function usePaymentSettings({ authenticated }: { authenticated?: boolean }) {
  const { t } = useI18n();

  // ── Payment Gateway Settings ─────────────────────────────────────────
  const [paymentSettings, setPaymentSettings] = useState<
    Record<string, string>
  >({});
  const [originalPaymentSettings, setOriginalPaymentSettings] = useState<
    Record<string, string>
  >({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const paymentQuery = useQuery({
    queryKey: ["payment-settings"],
    queryFn: getPaymentSettings,
    retry: 1,
  });

  const paymentSettingsList = paymentQuery.data?.settings ?? [];

  useEffect(() => {
    const mapped: Record<string, string> = {};
    paymentSettingsList.forEach((s) => {
      mapped[s.key] = s.value;
    });
    setPaymentSettings(mapped);
    setOriginalPaymentSettings(mapped);
  }, [paymentSettingsList]);

  const paymentMutation = useMutation({
    mutationFn: (payload: UpdatePaymentSettingsPayload) =>
      updatePaymentSettings(payload),
    onSuccess: (data) => {
      const mapped: Record<string, string> = {};
      (data.settings ?? []).forEach((s) => {
        mapped[s.key] = s.value;
      });
      setPaymentSettings(mapped);
      setOriginalPaymentSettings(mapped);
      alertLib.fire(
        t("settings.payment.savedTitle"),
        t("settings.payment.savedMessage"),
        "success",
        "settings",
      );
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.payment.saveFailedTitle"),
        error?.message || t("settings.payment.saveFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const testGatewayMutation = useMutation({
    mutationFn: testPaymentGateway,
    onSuccess: (data) => {
      alertLib.fire(
        t("settings.payment.testSuccessTitle"),
        data.message ||
          t("settings.payment.testSuccessMessage", {
            gateway: data.gateway,
            environment: data.environment || "sandbox",
          }),
        "success",
        "settings",
      );
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.payment.testFailedTitle"),
        error?.message || t("settings.payment.testFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const handleSavePaymentSettings = async () => {
    const isConfirmed = await alertLib.confirm(
      t("settings.payment.confirmTitle"),
      t("settings.payment.confirmMessage"),
      t("settings.payment.confirmSave"),
      t("common.cancel"),
      "question",
      "settings",
    );
    if (isConfirmed) {
      paymentMutation.mutate({ settings: paymentSettings });
    }
  };

  useEffect(() => {
    if (authenticated) {
      void paymentQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  return {
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
  };
}

export type PaymentSettings = ReturnType<typeof usePaymentSettings>;

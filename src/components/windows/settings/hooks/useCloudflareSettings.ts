import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteCFConfig, getCFConfig, setCFConfig, verifyCFConfig } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";

export function useCloudflareSettings() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  // ── Cloudflare Settings ──────────────────────────────────────────────
  const [cfForm, setCfForm] = useState({
    apiToken: "",
    accountId: "",
    zoneId: "",
    baseDomain: "",
  });
  const [showCfToken, setShowCfToken] = useState(false);
  const cfQuery = useQuery({
    queryKey: ["cf-config"],
    queryFn: getCFConfig,
    retry: 1,
  });
  const cf = cfQuery.data;

  const saveCFMut = useMutation({
    mutationFn: setCFConfig,
    onSuccess: () => {
      alertLib.fire(
        t("profile.cloudflareSavedTitle") || "Cloudflare Config Saved",
        t("profile.cloudflareSavedMessage") ||
          "Your Cloudflare API credentials have been saved successfully.",
        "success",
        "settings",
      );
      queryClient.invalidateQueries({ queryKey: ["cf-config"] });
      queryClient.invalidateQueries({ queryKey: ["me-v2"] });
      setCfForm({ apiToken: "", accountId: "", zoneId: "", baseDomain: "" });
      verifyCFMut.mutate();
    },
    onError: (e: any) => {
      const message =
        e.response?.data?.error ??
        (t("profile.saveConfigFailed") || "Failed to save Cloudflare config");
      alertLib.fire(
        t("profile.cloudflareSaveFailedTitle") || "Save Failed",
        message,
        "error",
        "settings",
      );
    },
  });

  const verifyCFMut = useMutation({
    mutationFn: verifyCFConfig,
    onSuccess: (res) => {
      if (res.valid) {
        alertLib.fire(
          t("profile.verifySuccessTitle") || "Token Verified",
          t("profile.verifySuccessMessage") ||
            "Cloudflare API token is valid and active.",
          "success",
          "settings",
        );
      } else {
        alertLib.fire(
          t("profile.invalidTokenTitle") || "Invalid Token",
          res.error ??
            (t("profile.unknownError") ||
              "Cloudflare API token verification failed."),
          "warning",
          "settings",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["cf-config"] });
      queryClient.invalidateQueries({ queryKey: ["me-v2"] });
    },
    onError: () => {
      alertLib.fire(
        t("profile.verifyFailedTitle") || "Verification Failed",
        t("profile.verifyFailedMessage") ||
          "Could not verify token with Cloudflare API.",
        "error",
        "settings",
      );
    },
  });

  const deleteCFMut = useMutation({
    mutationFn: deleteCFConfig,
    onSuccess: () => {
      alertLib.fire(
        t("profile.cloudflareDeletedTitle") || "Configuration Deleted",
        t("profile.cloudflareDeletedMessage") ||
          "Cloudflare credentials removed.",
        "success",
        "settings",
      );
      queryClient.invalidateQueries({ queryKey: ["cf-config"] });
      queryClient.invalidateQueries({ queryKey: ["me-v2"] });
    },
    onError: (e: any) => {
      alertLib.fire(
        t("profile.cloudflareDeleteFailedTitle") || "Delete Failed",
        e.response?.data?.error ??
          (t("profile.cloudflareDeleteFailedMessage") ||
            "Could not remove credentials."),
        "error",
        "settings",
      );
    },
  });

  const handleDeleteCloudflare = async () => {
    const confirmed = await alertLib.confirm(
      t("profile.deleteConfirmTitle") || "Delete Cloudflare Config",
      t("profile.deleteConfirmMessage") ||
        "Are you sure you want to remove Cloudflare credentials from this server?",
      t("profile.deleteConfirmAction") || "Delete Credentials",
      t("common.cancel"),
      "warning",
      "settings",
    );
    if (confirmed) deleteCFMut.mutate();
  };

  return {
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
  };
}

export type CloudflareSettings = ReturnType<typeof useCloudflareSettings>;

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getDatabaseStatus, getEditableSystemSettings, resetDatabasePassword, resetPrimaryPanelPassword, updateEditableSystemSettings, updatePanelOrigins, updatePanelPort } from "@/api/agent";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import { type ResetDatabasePasswordResponse, type ResetPrimaryPanelPasswordPayload, type UpdatePanelPortPayload, type UpdateSystemSettingsPayload } from "@/types";

export function useHostSettings({ authenticated }: { authenticated?: boolean }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ["editable-system-settings"],
    queryFn: getEditableSystemSettings,
    retry: 1,
  });

  // the panel's own database is readable by the superadmin only
  const isSuperadmin = useAuthStore((s) => s.user?.role) === "superadmin";
  const databaseQuery = useQuery({
    queryKey: ["database-status"],
    queryFn: getDatabaseStatus,
    retry: 1,
    refetchInterval: 10_000,
    enabled: isSuperadmin,
  });

  const [hostname, setHostname] = useState("");
  const [timezone, setTimezone] = useState("");
  const [nameservers, setNameservers] = useState<string[]>([]);
  const [panelPort, setPanelPort] = useState("");
  const [allowedOriginsText, setAllowedOriginsText] = useState("");
  const [dbResetResult, setDbResetResult] =
    useState<ResetDatabasePasswordResponse | null>(null);
  const [primaryPassword, setPrimaryPassword] = useState("");
  const [primaryPasswordConfirm, setPrimaryPasswordConfirm] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setHostname(query.data.hostname ?? "");
    setTimezone(query.data.timezone ?? "");
    setNameservers(query.data.nameservers ?? []);
    setPanelPort(query.data.bindAddr?.split(":").slice(-1)[0] ?? "");
    setAllowedOriginsText(
      query.data.originsRaw || (query.data.allowedOrigins ?? []).join("\n"),
    );
  }, [query.data]);

  const payload = useMemo<UpdateSystemSettingsPayload>(
    () => ({
      hostname: hostname.trim(),
      timezone: timezone.trim(),
      nameservers: nameservers.map((value) => value.trim()).filter(Boolean),
    }),
    [hostname, timezone, nameservers],
  );

  const portPayload = useMemo<UpdatePanelPortPayload>(
    () => ({
      port: Number(panelPort.trim()),
    }),
    [panelPort],
  );

  const primaryPasswordPayload = useMemo<ResetPrimaryPanelPasswordPayload>(
    () => ({
      newPassword: primaryPassword,
      confirmPassword: primaryPasswordConfirm,
    }),
    [primaryPassword, primaryPasswordConfirm],
  );

  const syncSettingsSnapshot = (
    data: Awaited<ReturnType<typeof getEditableSystemSettings>>,
  ) => {
    queryClient.setQueryData(["editable-system-settings"], data);
    queryClient.invalidateQueries({ queryKey: ["agent-system-summary"] });
    queryClient.invalidateQueries({ queryKey: ["database-status"] });
    setPanelPort(data.bindAddr?.split(":").slice(-1)[0] ?? "");
    setAllowedOriginsText(
      data.originsRaw || (data.allowedOrigins ?? []).join("\n"),
    );
  };

  const mutation = useMutation({
    mutationFn: updateEditableSystemSettings,
    onSuccess: (data) => {
      alertLib.fire(
        t("settings.host.savedTitle"),
        t("settings.host.savedMessage"),
        "success",
        "settings",
      );
      syncSettingsSnapshot(data);
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.host.saveFailedTitle"),
        error?.message || t("settings.host.saveFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const panelPortMutation = useMutation({
    mutationFn: updatePanelPort,
    onSuccess: (data) => {
      alertLib.fire(
        t("settings.port.updatedTitle"),
        t("settings.port.updatedMessage"),
        "success",
        "settings",
      );
      syncSettingsSnapshot(data);
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.port.updateFailedTitle"),
        error?.message || t("settings.port.updateFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const panelOriginsMutation = useMutation({
    mutationFn: updatePanelOrigins,
    onSuccess: (data) => {
      alertLib.fire(
        t("settings.origins.savedTitle"),
        t("settings.origins.savedMessage"),
        "success",
        "settings",
      );
      syncSettingsSnapshot(data);
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.origins.saveFailedTitle"),
        error?.message || t("settings.origins.saveFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const resetDatabaseMutation = useMutation({
    mutationFn: resetDatabasePassword,
    onSuccess: (data) => {
      setDbResetResult(data);
      alertLib.fire(
        t("settings.database.rotatedTitle"),
        t("settings.database.rotatedMessage"),
        "success",
        "settings",
      );
      queryClient.invalidateQueries({ queryKey: ["database-status"] });
      queryClient.invalidateQueries({ queryKey: ["agent-system-summary"] });
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.database.rotateFailedTitle"),
        error?.message || t("settings.database.rotateFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const resetPrimaryPasswordMutation = useMutation({
    mutationFn: resetPrimaryPanelPassword,
    onSuccess: (data) => {
      setPrimaryPassword("");
      setPrimaryPasswordConfirm("");
      alertLib.fire(
        t("settings.password.updatedTitle"),
        data.message || t("settings.password.updatedMessage"),
        "success",
        "settings",
      );
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.password.updateFailedTitle"),
        error?.message || t("settings.password.updateFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const handleUpdateIdentity = async () => {
    const isConfirmed = await alertLib.confirm(
      t("settings.host.confirmTitle"),
      t("settings.host.confirmMessage"),
      t("settings.host.confirmAction"),
      t("common.cancel"),
      "question",
      "settings",
    );

    if (isConfirmed) {
      if (!hostname.trim() || !timezone.trim()) {
        alertLib.fire(
          t("settings.host.incompleteTitle"),
          t("settings.host.incompleteMessage"),
          "warning",
          "settings",
        );
        return;
      }
      mutation.mutate(payload);
    }
  };

  const handleUpdatePanelPort = async () => {
    const isConfirmed = await alertLib.confirm(
      t("settings.port.confirmTitle"),
      t("settings.port.confirmMessage", { port: portPayload.port }),
      t("settings.port.confirmAction"),
      t("common.cancel"),
      "warning",
      "settings",
    );
    if (isConfirmed) panelPortMutation.mutate(portPayload);
  };

  const handleUpdateOrigins = async () => {
    const isConfirmed = await alertLib.confirm(
      t("settings.origins.confirmTitle"),
      t("settings.origins.confirmMessage"),
      t("settings.origins.confirmAction"),
      t("common.cancel"),
      "question",
      "settings",
    );
    if (isConfirmed)
      panelOriginsMutation.mutate({ originsRaw: allowedOriginsText });
  };

  const handleResetDatabase = async () => {
    const isConfirmed = await alertLib.confirm(
      t("settings.database.confirmTitle"),
      t("settings.database.confirmMessage"),
      t("settings.database.confirmAction"),
      t("common.close"),
      "warning",
      "settings",
    );
    if (isConfirmed) resetDatabaseMutation.mutate();
  };

  const handleResetPrimaryPassword = async () => {
    if (!primaryPassword.trim() || !primaryPasswordConfirm.trim()) {
      alertLib.fire(
        t("settings.password.incompleteTitle"),
        t("settings.password.incompleteMessage"),
        "warning",
        "settings",
      );
      return;
    }
    if (primaryPassword !== primaryPasswordConfirm) {
      alertLib.fire(
        t("settings.password.mismatchTitle"),
        t("settings.password.mismatchMessage"),
        "warning",
        "settings",
      );
      return;
    }

    const isConfirmed = await alertLib.confirm(
      t("settings.password.confirmTitle"),
      t("settings.password.confirmMessage"),
      t("settings.password.confirmAction"),
      t("common.cancel"),
      "warning",
      "settings",
    );

    if (isConfirmed)
      resetPrimaryPasswordMutation.mutate(primaryPasswordPayload);
  };


  const settingsAudit = databaseQuery.data?.settingsAudit ?? [];

  useEffect(() => {
    if (authenticated) {
      void query.refetch();
      void databaseQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  return {
    query,
    databaseQuery,
    hostname,
    setHostname,
    timezone,
    setTimezone,
    nameservers,
    setNameservers,
    panelPort,
    setPanelPort,
    allowedOriginsText,
    setAllowedOriginsText,
    dbResetResult,
    primaryPassword,
    setPrimaryPassword,
    primaryPasswordConfirm,
    setPrimaryPasswordConfirm,
    mutation,
    panelPortMutation,
    panelOriginsMutation,
    resetDatabaseMutation,
    resetPrimaryPasswordMutation,
    handleUpdateIdentity,
    handleUpdatePanelPort,
    handleUpdateOrigins,
    handleResetDatabase,
    handleResetPrimaryPassword,
    settingsAudit,
  };
}

export type HostSettings = ReturnType<typeof useHostSettings>;

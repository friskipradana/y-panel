import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteNotificationDevice, getCapturedNotifications, getNotificationDevices, registerNotificationDevice, updateNotificationDevice } from "@/api/agent";
import { useCapturedNotificationsSocket } from "@/hooks/useCapturedNotificationsSocket";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/authStore";
import { type CapturedNotification, type RegisterNotificationDevicePayload, type UpdateNotificationDevicePayload } from "@/types";

export function useNotificationSettings({ authenticated }: { authenticated?: boolean }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  // devices and captured notifications are admin+ only on the agent
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "admin" || role === "superadmin";

  // ── Notification Devices ─────────────────────────────────────────────
  const [listenerDeviceId, setListenerDeviceId] =
    useState("wimboro-device-001");
  const [listenerApiKey, setListenerApiKey] = useState("");
  const [listenerPackageFilter, setListenerPackageFilter] = useState(
    "id.dana, com.whatsapp, com.gojek.gopay",
  );
  const [listenerStatus, setListenerStatus] = useState("active");
  const notificationDevicesQuery = useQuery({
    queryKey: ["notification-devices"],
    queryFn: getNotificationDevices,
    retry: 1,
    enabled: canManage,
  });

  const capturedNotificationsQuery = useQuery({
    queryKey: ["captured-notifications"],
    queryFn: getCapturedNotifications,
    retry: 1,
    enabled: canManage,
  });

  const notificationDevices = notificationDevicesQuery.data?.devices ?? [];
  const capturedNotifications: CapturedNotification[] =
    capturedNotificationsQuery.data?.notifications ?? [];
  const parsePackageFilter = () =>
    listenerPackageFilter
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const panelOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const listenerRegisterUrl = `${panelOrigin}/api/v1/notification-devices`;
  const listenerWebhookUrl = `${panelOrigin}/api/v1/webhooks/notifications`;
  const listenerSocketUrl = `${panelOrigin.replace(/^http/, "ws")}/api/v1/captured-notifications/ws`;

  const registerDeviceMutation = useMutation({
    mutationFn: (payload: RegisterNotificationDevicePayload) =>
      registerNotificationDevice(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["notification-devices"], (old: any) => ({
        ...(old ?? { ok: true }),
        devices: [
          data.device,
          ...(old?.devices ?? []).filter(
            (device: any) => device.deviceId !== data.device.deviceId,
          ),
        ],
      }));
      void notificationDevicesQuery.refetch();
      alertLib.fire(
        t("settings.listener.deviceSavedTitle"),
        t("settings.listener.deviceSavedMessage"),
        "success",
        "settings",
      );
      setListenerApiKey("");
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.listener.deviceSaveFailedTitle"),
        error?.message || t("settings.listener.deviceSaveFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const updateDeviceMutation = useMutation({
    mutationFn: ({
      deviceId,
      payload,
    }: {
      deviceId: string;
      payload: UpdateNotificationDevicePayload;
    }) => updateNotificationDevice(deviceId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["notification-devices"], (old: any) => ({
        ...(old ?? { ok: true }),
        devices: (old?.devices ?? []).map((device: any) =>
          device.deviceId === data.device.deviceId ? data.device : device,
        ),
      }));
      void notificationDevicesQuery.refetch();
      alertLib.fire(
        t("settings.listener.deviceUpdatedTitle"),
        t("settings.listener.deviceUpdatedMessage"),
        "success",
        "settings",
      );
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.listener.deviceUpdateFailedTitle"),
        error?.message || t("settings.listener.deviceUpdateFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: (deviceId: string) => deleteNotificationDevice(deviceId),
    onSuccess: () => {
      void notificationDevicesQuery.refetch();
      alertLib.fire(
        t("settings.listener.deviceDeletedTitle"),
        t("settings.listener.deviceDeletedMessage"),
        "success",
        "settings",
      );
    },
    onError: (error: any) => {
      alertLib.fire(
        t("settings.listener.deviceDeleteFailedTitle"),
        error?.message || t("settings.listener.deviceDeleteFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const handleSaveListenerDevice = async () => {
    const deviceId = listenerDeviceId.trim();
    const apiKey = listenerApiKey.trim();
    if (!deviceId || !apiKey) {
      alertLib.fire(
        t("settings.listener.incompleteTitle"),
        t("settings.listener.incompleteMessage"),
        "warning",
        "settings",
      );
      return;
    }
    const confirmed = await alertLib.confirm(
      t("settings.listener.saveKeyConfirmTitle"),
      t("settings.listener.saveKeyConfirmMessage"),
      t("settings.listener.saveKeyConfirmAction"),
      t("common.cancel"),
      "question",
      "settings",
    );
    if (!confirmed) return;
    registerDeviceMutation.mutate({
      deviceId,
      apiKey,
      packageFilter: parsePackageFilter(),
    });
  };

  const handleUseDeviceForEdit = (
    deviceId: string,
    packageFilter: string[],
    status: string,
  ) => {
    setListenerDeviceId(deviceId);
    setListenerPackageFilter((packageFilter ?? []).join(", "));
    setListenerStatus(status || "active");
    setListenerApiKey("");
  };

  const handleUpdateListenerMetadata = () => {
    const deviceId = listenerDeviceId.trim();
    if (!deviceId) {
      alertLib.fire(
        t("settings.listener.emptyDeviceIdTitle"),
        t("settings.listener.emptyDeviceIdMessage"),
        "warning",
        "settings",
      );
      return;
    }
    updateDeviceMutation.mutate({
      deviceId,
      payload: { status: listenerStatus, packageFilter: parsePackageFilter() },
    });
  };

  const handleDeleteListenerDevice = async (deviceId: string) => {
    const confirmed = await alertLib.confirm(
      t("settings.listener.deleteConfirmTitle"),
      t("settings.listener.deleteConfirmMessage", { deviceId }),
      t("common.delete"),
      t("common.cancel"),
      "warning",
      "settings",
    );
    if (confirmed) deleteDeviceMutation.mutate(deviceId);
  };

  // ── Real-time captured notification WebSocket ────────────────────────
  const capturedWS = useCapturedNotificationsSocket({
    enabled: !!authenticated && canManage,
    onCaptured: (notification: CapturedNotification) => {
      queryClient.setQueryData(["captured-notifications"], (old: any) => {
        const existingNotifications = old?.notifications ?? [];
        const exists = existingNotifications.some(
          (n: CapturedNotification) => n.id === notification.id,
        );
        if (exists) return old;
        return {
          ...old,
          notifications: [notification, ...existingNotifications].slice(0, 50),
        };
      });
      void notificationDevicesQuery.refetch();
    },
  });

  useEffect(() => {
    if (authenticated) {
      void notificationDevicesQuery.refetch();
      void capturedNotificationsQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  return {
    listenerDeviceId,
    setListenerDeviceId,
    listenerApiKey,
    setListenerApiKey,
    listenerPackageFilter,
    setListenerPackageFilter,
    listenerStatus,
    setListenerStatus,
    notificationDevicesQuery,
    capturedNotificationsQuery,
    notificationDevices,
    capturedNotifications,
    listenerRegisterUrl,
    listenerWebhookUrl,
    listenerSocketUrl,
    registerDeviceMutation,
    updateDeviceMutation,
    deleteDeviceMutation,
    handleSaveListenerDevice,
    handleUseDeviceForEdit,
    handleUpdateListenerMetadata,
    handleDeleteListenerDevice,
    capturedWS,
  };
}

export type NotificationSettings = ReturnType<typeof useNotificationSettings>;

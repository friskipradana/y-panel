import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteNotificationDevice, getCapturedNotifications, getNotificationDevices, registerNotificationDevice, rotateNotificationDeviceKey, updateNotificationDevice } from "@/api/agent";
import { useCapturedNotificationsSocket } from "@/hooks/useCapturedNotificationsSocket";
import { alertLib } from "@/lib/alert";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/authStore";
import { type CapturedNotification, type RegisterNotificationDevicePayload, type UpdateNotificationDevicePayload } from "@/types";

// What the agent said, not the generic text of the failed request
const serverMessage = (error: unknown): string | undefined => {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message;
};

export function useNotificationSettings({ authenticated }: { authenticated?: boolean }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  // devices and captured notifications are admin+ only on the agent
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "admin" || role === "superadmin";

  // ── Notification Devices ─────────────────────────────────────────────
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
  const panelOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const listenerWebhookUrl = `${panelOrigin}/api/v1/webhooks/notifications`;
  const listenerSocketUrl = `${panelOrigin.replace(/^http/, "ws")}/api/v1/captured-notifications/ws`;

  const refreshDevices = () => queryClient.invalidateQueries({ queryKey: ["notification-devices"] });

  // the key is in the answer once; the dialog that asked shows it, so there is no alert here
  const registerDeviceMutation = useMutation({
    mutationFn: (payload: RegisterNotificationDevicePayload) => registerNotificationDevice(payload),
    onSuccess: () => void refreshDevices(),
    onError: (error: unknown) => {
      alertLib.fire(
        t("settings.listener.deviceSaveFailedTitle"),
        serverMessage(error) || t("settings.listener.deviceSaveFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const rotateKeyMutation = useMutation({
    mutationFn: (deviceId: string) => rotateNotificationDeviceKey(deviceId),
    onSuccess: () => void refreshDevices(),
    onError: (error: unknown) => {
      alertLib.fire(
        t("settings.listener.keyFailedTitle"),
        serverMessage(error) || t("settings.listener.keyFailedMessage"),
        "error",
        "settings",
      );
    },
  });

  const updateDeviceMutation = useMutation({
    mutationFn: ({ deviceId, payload }: { deviceId: string; payload: UpdateNotificationDevicePayload }) =>
      updateNotificationDevice(deviceId, payload),
    onSuccess: () => {
      void refreshDevices();
      alertLib.fire(
        t("settings.listener.deviceUpdatedTitle"),
        t("settings.listener.deviceUpdatedMessage"),
        "success",
        "settings",
      );
    },
    onError: (error: unknown) => {
      alertLib.fire(
        t("settings.listener.deviceUpdateFailedTitle"),
        serverMessage(error) || t("settings.listener.deviceUpdateFailedMessage"),
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
        serverMessage(error) || t("settings.listener.deviceDeleteFailedMessage"),
        "error",
        "settings",
      );
    },
  });

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
    notificationDevicesQuery,
    capturedNotificationsQuery,
    notificationDevices,
    capturedNotifications,
    listenerWebhookUrl,
    listenerSocketUrl,
    registerDeviceMutation,
    rotateKeyMutation,
    updateDeviceMutation,
    deleteDeviceMutation,
    handleDeleteListenerDevice,
    capturedWS,
  };
}

export type NotificationSettings = ReturnType<typeof useNotificationSettings>;

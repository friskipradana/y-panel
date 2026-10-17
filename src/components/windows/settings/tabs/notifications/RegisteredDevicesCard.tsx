import { Pencil, Smartphone, Trash2 } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import type { UiTone } from "@/components/ui/IconBadge";

const STATUS_TONE: Record<string, UiTone> = { active: "success", inactive: "neutral" };

// The phones that send notifications to this panel
export function RegisteredDevicesCard({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const { notificationDevicesQuery, notificationDevices, deleteDeviceMutation, handleUseDeviceForEdit, handleDeleteListenerDevice } = listener;

  return (
    <section className="panel-shell-card settings-card">
      <SectionHeader
        icon={<Smartphone />}
        title={t("settings.listener.registeredDevices")}
        actions={<Badge tone="info">{t("settings.listener.deviceCount", { count: notificationDevices.length })}</Badge>}
      />

      {notificationDevicesQuery.isLoading ? (
        <LoadingState>{t("settings.listener.loadingDevices")}</LoadingState>
      ) : notificationDevicesQuery.isError ? (
        <ErrorState title={t("settings.listener.devicesFailed")} hint={t("settings.listener.retryHint")} />
      ) : notificationDevices.length === 0 ? (
        <EmptyState icon={<Smartphone />}>{t("settings.listener.noDevices")}</EmptyState>
      ) : (
        <div className="panel-table-container max-h-[300px] overflow-y-auto">
          {notificationDevices.map((device) => (
            <ListRow
              key={device.id}
              title={<span className="truncate" title={device.deviceId}>{device.deviceId}</span>}
              tag={<Badge tone={STATUS_TONE[device.status] ?? "danger"} dot>{device.status}</Badge>}
              details={(device.packageFilter ?? []).length ? (device.packageFilter ?? []).join(", ") : t("settings.listener.allPackages")}
              actions={
                <>
                  <IconButton label={t("common.edit")} onClick={() => handleUseDeviceForEdit(device.deviceId, device.packageFilter ?? [], device.status)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label={t("common.delete")} tone="danger" disabled={deleteDeviceMutation.isPending} onClick={() => void handleDeleteListenerDevice(device.deviceId)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

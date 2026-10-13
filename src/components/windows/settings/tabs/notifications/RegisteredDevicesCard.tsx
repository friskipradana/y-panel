import { LoaderCircle, Smartphone, Trash2 } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { IconButton } from "@/components/ui/IconButton"

export function RegisteredDevicesCard({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const {
    notificationDevicesQuery,
    notificationDevices,
    deleteDeviceMutation,
    handleUseDeviceForEdit,
    handleDeleteListenerDevice,
  } = listener;

  return (
    <div className="panel-shell-card p-4.5 flex flex-col justify-between">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeader
            icon={<Smartphone />}
            title={t("settings.listener.registeredDevices")}
          />
          <Badge tone="info" className="text-[10.5px]">
            {t("settings.listener.deviceCount", {
              count: notificationDevices.length,
            })}
          </Badge>
        </div>

        {notificationDevicesQuery.isLoading ? (
          <div className="panel-loading min-h-[100px]">
            <LoaderCircle size={16} className="animate-spin" />
          </div>
        ) : !notificationDevices.length ? (
          <div className="panel-empty min-h-[140px] text-[12px] flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]">
            <Smartphone size={24} className="opacity-40 mb-1" />
            <span>{t("settings.listener.noDevices")}</span>
          </div>
        ) : (
          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
            {notificationDevices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3.5 py-2.5 transition hover:border-[var(--panel-primary-solid)]/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="rounded-lg bg-[var(--panel-primary-bg)] p-1.5 text-[var(--panel-primary-text)] shrink-0">
                    <Smartphone size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-[var(--win-text)]">
                      {device.deviceId}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-secondary)]">
                      {(device.packageFilter ?? []).length
                        ? (device.packageFilter ?? []).join(", ")
                        : t("settings.listener.allPackages")}
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium ${
                      device.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : device.status === "inactive"
                          ? "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        device.status === "active"
                          ? "bg-emerald-400"
                          : device.status === "inactive"
                            ? "bg-gray-400"
                            : "bg-rose-400"
                      }`}
                    />
                    {device.status}
                  </span>
                  <Button
                    type="button" variant="ghost" className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
                    onClick={() =>
                      handleUseDeviceForEdit(
                        device.deviceId,
                        device.packageFilter ?? [],
                        device.status,
                      )
                    }
                  >
                    {t("common.edit")}
                  </Button>
                  <IconButton
                    type="button" label={t("common.delete")} className="h-7 w-7 rounded-lg text-rose-400 hover:bg-rose-500/10"
                    onClick={() =>
                      void handleDeleteListenerDevice(
                        device.deviceId,
                      )
                    }
                    disabled={deleteDeviceMutation.isPending}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

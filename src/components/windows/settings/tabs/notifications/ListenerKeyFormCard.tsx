import { BadgeCheck, Copy, Key, RefreshCcw, Save } from "lucide-react";
import { copyTextToClipboard } from "@/api/agent";
import { Select } from "@/components/ui/Select";
import { FieldLabel } from "../../SettingsPrimitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../../constants";
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"

export function ListenerKeyFormCard({ listener, setActiveTab }: { listener: NotificationSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const {
    listenerDeviceId,
    setListenerDeviceId,
    listenerApiKey,
    setListenerApiKey,
    listenerPackageFilter,
    setListenerPackageFilter,
    listenerStatus,
    setListenerStatus,
    registerDeviceMutation,
    updateDeviceMutation,
    handleSaveListenerDevice,
    handleUpdateListenerMetadata,
  } = listener;

  return (
    <div className="panel-shell-card settings-card flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--panel-primary-text)]/20 bg-[var(--panel-primary-bg)] p-3 text-[12px]">
        <div className="flex items-center gap-2 text-[var(--win-text)]">
          <Key size={14} className="text-[var(--panel-primary-text)] shrink-0" />
          <span>{t("settings.listener.tokenNotice")}</span>
        </div>
        <Button
          type="button"
          onClick={() => setActiveTab("api_tokens")} variant="primary" size="sm" className="shrink-0"
        >
          {t("settings.listener.openTokens")}
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon={<Key />}
          title={t("settings.listener.manageTitle")}
          subtitle={t("settings.listener.manageSubtitle")}
        />
        <Button
          type="button" variant="ghost" icon={<RefreshCcw size={12} />}
          onClick={() =>
            setListenerApiKey(
              `ypnl_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
            )
          }
        >
          {t("settings.listener.generateKey")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <FieldLabel label={t("settings.listener.deviceId")} />
          <TextInput
            id="notification-device-id"
            value={listenerDeviceId}
            onChange={(event) =>
              setListenerDeviceId(event.target.value)
            }
            placeholder={t(
              "settings.listener.deviceIdPlaceholder",
            )} className="h-[38px] px-3 text-[12.5px] font-medium"
          />
        </div>

        <div>
          <FieldLabel label={t("settings.listener.newApiKey")} />
          <TextInput
            id="notification-device-api-key"
            type="password"
            value={listenerApiKey}
            onChange={(event) =>
              setListenerApiKey(event.target.value)
            }
            placeholder={t(
              "settings.listener.newApiKeyPlaceholder",
            )} className="panel-mono h-[38px] px-3 text-[12.5px]"
          />
        </div>

        <div>
          <FieldLabel label={t("settings.listener.status")} />
          <Select
            id="notification-device-status"
            value={listenerStatus}
            onChange={setListenerStatus}
            options={[
              { value: "active", label: "active" },
              { value: "inactive", label: "inactive" },
              { value: "blocked", label: "blocked" },
            ]}
            className="w-full"
            buttonClassName="panel-input min-h-[38px] justify-between rounded-xl px-3 py-1.5 text-[12.5px] font-medium"
            dropdownClassName="left-auto right-0 z-[700] min-w-[180px]"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <FieldLabel
            label={t("settings.listener.packageFilter")}
            hint={t("settings.listener.packageHint")}
          />
          <TextInput
            id="notification-device-package-filter"
            value={listenerPackageFilter}
            onChange={(event) =>
              setListenerPackageFilter(event.target.value)
            }
            placeholder={t(
              "settings.listener.packageFilterPlaceholder",
            )} className="h-[38px] px-3 text-[12.5px]"
          />
        </div>
      </div>

      <p
        id="notification-device-api-key-help"
        className="text-[11.5px] leading-relaxed text-[var(--text-secondary)] opacity-80"
      >
        {t("settings.listener.apiKeyHelp")}
      </p>

      <div className="border-t border-[var(--win-border)] pt-3.5 flex flex-wrap items-center gap-2">
        <Button
          id="notification-save-api-key"
          type="button"
          variant="primary"
          icon={<Save size={13} />}
          loading={registerDeviceMutation.isPending}
          onClick={handleSaveListenerDevice}
        >
          {t("settings.listener.saveApiKey")}
        </Button>
        <Button
          id="notification-update-device-meta"
          type="button"
          variant="ghost"
          icon={<BadgeCheck size={13} />}
          loading={updateDeviceMutation.isPending}
          onClick={handleUpdateListenerMetadata}
        >
          {t("settings.listener.updateMeta")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon={<Copy size={13} />}
          onClick={() => void copyTextToClipboard(listenerApiKey)}
          disabled={!listenerApiKey}
        >
          {t("settings.listener.copyNewKey")}
        </Button>
      </div>
    </div>
  );
}

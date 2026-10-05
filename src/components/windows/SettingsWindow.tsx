import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Cloud,
  Copy,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  Globe2,
  ImagePlus,
  Layout,
  LoaderCircle,
  LockKeyhole,
  Moon,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  Server,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Wifi,
  Waypoints,
  Zap,
  Lock,
} from "lucide-react";
import {
  copyTextToClipboard,
  getDatabaseStatus,
  getEditableSystemSettings,
  getPaymentSettings,
  updatePaymentSettings,
  testPaymentGateway,
  getNotificationDevices,
  registerNotificationDevice,
  updateNotificationDevice,
  deleteNotificationDevice,
  getCapturedNotifications,
  resetDatabasePassword,
  resetPrimaryPanelPassword,
  updateEditableSystemSettings,
  updatePanelOrigins,
  updatePanelPort,
  getCFConfig,
  setCFConfig,
  verifyCFConfig,
  deleteCFConfig,
} from "@/api/agent";
import { useCapturedNotificationsSocket } from "@/hooks/useCapturedNotificationsSocket";
import {
  useThemeStore,
  WALLPAPERS,
  type WallpaperKey,
} from "@/store/themeStore";
import { soundManager } from "@/lib/sound";
import { useWindowStore } from "@/store/windowStore";
import type { CapturedNotification } from "@/types";
import { PanelSelectMenu } from "@/components/system/PanelSelectMenu";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import type {
  ResetDatabasePasswordResponse,
  ResetPrimaryPanelPasswordPayload,
  UpdatePanelPortPayload,
  UpdateSystemSettingsPayload,
  UpdatePaymentSettingsPayload,
  RegisterNotificationDevicePayload,
  UpdateNotificationDevicePayload,
} from "@/types";

const TIMEZONES = [
  "UTC",
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Yangon",
  "Asia/Ho_Chi_Minh",
  "Asia/Manila",
  "Asia/Taipei",
  "Asia/Ulaanbaatar",
  "Asia/Almaty",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

const PRESET_DNS = [
  { label: "Cloudflare", value: "1.1.1.1", tone: "panel-badge--warning" },
  { label: "1.0.0.1", value: "1.0.0.1", tone: "panel-badge--warning" },
  { label: "Google", value: "8.8.8.8", tone: "panel-badge--success" },
  { label: "8.8.4.4", value: "8.8.4.4", tone: "panel-badge--success" },
  { label: "Quad9", value: "9.9.9.9", tone: "panel-badge--info" },
  { label: "OpenDNS", value: "208.67.222.222", tone: "panel-badge--neutral" },
];

type SettingsTabKey =
  | "general"
  | "appearance"
  | "cloudflare"
  | "network"
  | "security"
  | "payment"
  | "notifications"
  | "audit";

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-[var(--win-text)]">
        {label}
      </span>
      {hint ? (
        <span className="panel-mono text-[12px] text-[var(--text-secondary)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="panel-muted-block flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl text-[var(--win-text)]">
        {icon}
      </div>
      <div>
        <div className="text-[14px] font-bold text-[var(--win-text)]">
          {title}
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-[var(--text-secondary)]">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const timezoneOptions = useMemo(
    () => TIMEZONES.map((timezone) => ({ value: timezone, label: timezone })),
    [],
  );
  const { t } = useI18n();

  return (
    <PanelSelectMenu
      id="settings-timezone-select"
      value={value}
      onChange={onChange}
      options={timezoneOptions}
      placeholder={t("settings.timezonePlaceholder")}
      searchable
      searchPlaceholder={t("settings.timezoneSearchPlaceholder")}
    />
  );
}

function DnsEditor({
  nameservers,
  onChange,
}: {
  nameservers: string[];
  onChange: (v: string[]) => void;
}) {
  const [newEntry, setNewEntry] = useState("");
  const { t } = useI18n();

  const addEntry = () => {
    const value = newEntry.trim();
    if (!value || nameservers.includes(value)) return;
    onChange([...nameservers, value]);
    setNewEntry("");
  };

  const removeEntry = (index: number) =>
    onChange(nameservers.filter((_, currentIndex) => currentIndex !== index));
  const addPreset = (ip: string) => {
    if (!nameservers.includes(ip)) onChange([...nameservers, ip]);
  };

  return (
    <div className="flex flex-col gap-2">
      {nameservers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--win-border)] bg-[var(--panel-surface)] py-3 px-3.5 text-center text-[11.5px] text-[var(--text-secondary)]">
          <span>{t("settings.noNameservers")}</span>
        </div>
      ) : null}

      {nameservers.map((nameserver, index) => (
        <div
          key={`${nameserver}-${index}`}
          className="flex items-center gap-1.5"
        >
          <div className="panel-muted-block flex h-10 flex-1 items-center gap-2.5 rounded-[10px] px-3.5">
            <CheckCircle2
              size={13}
              className="text-[var(--panel-success-text)]"
            />
            <code className="panel-mono flex-1 break-all text-[12px] text-[var(--win-text)]">
              {nameserver}
            </code>
          </div>
          <button
            type="button"
            onClick={() => removeEntry(index)}
            className="panel-icon-btn h-[38px] w-[38px] rounded-[10px] border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] text-[var(--panel-danger-text)] hover:bg-[color:var(--panel-danger-bg)]"
            aria-label={t("settings.removeNameserverAria", { nameserver })}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <div className="mt-1 flex gap-1.5">
        <input
          value={newEntry}
          onChange={(event) => setNewEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEntry();
            }
          }}
          placeholder={t("settings.addDnsPlaceholder")}
          className="panel-input panel-input--mono h-10 flex-1 px-3.5 text-[12px]"
        />
        <button
          type="button"
          onClick={addEntry}
          className="panel-btn panel-btn--primary h-10 w-10 rounded-[10px] p-0"
          aria-label={t("settings.addNameserverAria")}
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {PRESET_DNS.map((preset) => {
          const active = nameservers.includes(preset.value);
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => addPreset(preset.value)}
              disabled={active}
              className={[
                "panel-badge transition",
                active ? preset.tone : "panel-badge--neutral",
              ].join(" ")}
            >
              <span className="panel-status-dot" />
              {preset.label}{" "}
              <code className="panel-mono text-[12px]">({preset.value})</code>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuditCard({
  username,
  createdAt,
  hostname,
  timezone,
  nameservers,
}: {
  username?: string;
  createdAt: string;
  hostname?: string;
  timezone?: string;
  nameservers: string[];
}) {
  const { t } = useI18n();

  return (
    <div className="panel-shell-card px-4 py-3.5 shadow-[var(--settings-audit-card-shadow)]">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.10em] text-[var(--text-secondary)]">
        <span>{username || "system"}</span>
        <span>•</span>
        <span>{new Date(createdAt).toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-1 text-[12px] text-[var(--win-text)]">
        <div>
          <strong className="text-[var(--text-secondary)]">
            {t("settings.hostColon")}
          </strong>{" "}
          {hostname || "—"}
        </div>
        <div>
          <strong className="text-[var(--text-secondary)]">
            {t("settings.tzColon")}
          </strong>{" "}
          {timezone || "—"}
        </div>
        <div>
          <strong className="text-[var(--text-secondary)]">
            {t("settings.dnsColon")}
          </strong>{" "}
          {nameservers.length ? nameservers.join(", ") : "—"}
        </div>
      </div>
    </div>
  );
}

export function SettingsWindow({ authenticated }: { authenticated?: boolean }) {
  const queryClient = useQueryClient();
  const { language, setLanguage, t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("general");

  const {
    mode,
    setMode,
    wallpaper,
    setWallpaper,
    customImageUrl,
    setCustomImage,
    desktopIconStyle,
    setDesktopIconStyle,
    desktopIconSize,
    setDesktopIconSize,
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    autoLockTimeout,
    setAutoLockTimeout,
    setIsLocked,
  } = useThemeStore();
  const autoHideDock = useWindowStore((s) => s.autoHideDock);
  const toggleDockAutoHide = useWindowStore((s) => s.toggleDockAutoHide);
  const showSystemStats = useWindowStore((s) => s.showSystemStats);
  const setShowSystemStats = useWindowStore((s) => s.setShowSystemStats);
  const systemStatsConfig = useWindowStore((s) => s.systemStatsConfig);
  const setSystemStatsConfig = useWindowStore((s) => s.setSystemStatsConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCustomWallpaperUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) void setCustomImage(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const query = useQuery({
    queryKey: ["editable-system-settings"],
    queryFn: getEditableSystemSettings,
    retry: 1,
  });

  const databaseQuery = useQuery({
    queryKey: ["database-status"],
    queryFn: getDatabaseStatus,
    retry: 1,
    refetchInterval: 10_000,
  });

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
  });

  const capturedNotificationsQuery = useQuery({
    queryKey: ["captured-notifications"],
    queryFn: getCapturedNotifications,
    retry: 1,
  });

  const notificationDevices = notificationDevicesQuery.data?.devices ?? [];
  const capturedNotifications: CapturedNotification[] =
    capturedNotificationsQuery.data?.notifications ?? [];
  const settingsAudit = databaseQuery.data?.settingsAudit ?? [];
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
    enabled: !!authenticated,
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
      void query.refetch();
      void databaseQuery.refetch();
      void paymentQuery.refetch();
      void notificationDevicesQuery.refetch();
      void capturedNotificationsQuery.refetch();
    }
  }, [authenticated]);

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

  const SETTINGS_TABS: {
    key: SettingsTabKey;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    {
      key: "general",
      label: t("settings.identity") || "General & Host",
      icon: Server,
    },
    { key: "appearance", label: "Appearance & Wallpaper", icon: Palette },
    { key: "cloudflare", label: "Cloudflare Integration", icon: Cloud },
    {
      key: "network",
      label: t("settings.allowedOrigins") || "Network & Ports",
      icon: Globe2,
    },
    {
      key: "security",
      label: t("settings.primaryPasswordTitle") || "Security & Passwords",
      icon: LockKeyhole,
    },
    {
      key: "payment",
      label: t("settings.paymentGateway") || "Payment Gateway",
      icon: CreditCard,
    },
    {
      key: "notifications",
      label: t("settings.listener.title") || "Push & Listener",
      icon: Smartphone,
    },
    {
      key: "audit",
      label: t("settings.auditTrail") || "Audit Trail",
      icon: Clock,
    },
  ];

  return (
    <div className="panel-window flex flex-col h-full overflow-hidden">
      {/* ── Window Body: Desktop UI Sidebar + Content Area ── */}
      <div className="panel-window__body flex-1 min-h-0 flex flex-row overflow-hidden p-0">
        {/* ── Left Sidebar Navigation (Matching Applications Drawer Style) ── */}
        <div className="w-[200px] xl:w-[220px] shrink-0 border-r border-[var(--win-border)] bg-[var(--panel-surface)] p-2.5 flex flex-col gap-1 overflow-y-auto select-none">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-80">
            {t("settings.title")}
          </div>
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-[12px] font-medium border transition-colors duration-150 cursor-pointer outline-none focus:outline-none ${
                  isActive
                    ? "bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold border-[var(--panel-primary-text)]/25 shadow-xs"
                    : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)]"
                }`}
              >
                <Icon
                  size={15}
                  className={isActive ? "text-[var(--panel-primary-text)]" : "text-[var(--text-secondary)] opacity-70"}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Right Content Area ── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-5">
          {query.isLoading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              <div className="panel-loading">
                <LoaderCircle size={16} className="animate-spin" />
                {t("settings.loadingHostSettings")}
              </div>
            </div>
          )}

          {!query.isLoading && (query.isError || !query.data) && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              <div className="panel-error-state">
                <Database className="h-5 w-5" />
                <div>
                  <p className="font-semibold">
                    {t("settings.hostLoadFailed")}
                  </p>
                  <p className="mt-1 text-[12px] leading-6 opacity-90">
                    {t("settings.hostLoadFailedHint")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!query.isLoading && query.data && (
            <>
              {/* ── 1. General & Host ── */}
              {activeTab === "general" && (
                <div className="space-y-3.5">
                  {/* Compact Host System Info Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] text-[12px]">
                    <div className="flex items-center gap-2 text-[var(--win-text)] font-semibold">
                      <Server
                        size={14}
                        className="text-[var(--panel-primary-text)]"
                      />
                      <span>{query.data.osName}</span>
                      <span className="text-[var(--text-secondary)] font-normal">
                        ({query.data.kernel})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--panel-surface-hover)] px-2.5 py-0.5 text-[11px] text-[var(--win-text)] font-mono">
                        <ShieldCheck
                          size={12}
                          className="text-[var(--panel-success-text)]"
                        />
                        DNS: {query.data.dnsMode}
                      </span>
                    </div>
                  </div>

                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                      <div>
                        <SectionHeader
                          icon={<Server size={17} />}
                          title={t("settings.identity")}
                          subtitle={t("settings.identitySubtitle")}
                        />
                        <div className="flex flex-col gap-3.5 mt-2">
                          <div>
                            <FieldLabel
                              label={t("settings.hostname")}
                              hint="hostnamectl"
                            />
                            <input
                              id="settings-hostname"
                              value={hostname}
                              onChange={(event) =>
                                setHostname(event.target.value)
                              }
                              className="panel-input h-[42px] px-3.5 text-[13px]"
                              placeholder={t("settings.hostnamePlaceholder")}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("settings.timezone")}
                              hint="timedatectl"
                            />
                            <TimezoneSelect
                              value={timezone}
                              onChange={setTimezone}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <SectionHeader
                          icon={<Globe2 size={17} />}
                          title={t("settings.dnsNameservers")}
                          subtitle={t("settings.activeMode", {
                            mode: query.data.dnsMode,
                            path: query.data.managedConfigPath,
                          })}
                        />
                        <div className="mt-2">
                          <DnsEditor
                            nameservers={nameservers}
                            onChange={setNameservers}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-[var(--win-border)] pt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="panel-muted-block flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--win-text)]">
                          <BadgeCheck size={18} />
                        </div>
                        <div>
                          <div className="text-[14px] font-semibold text-[var(--win-text)]">
                            {t("settings.saveHostChanges")}
                          </div>
                          <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                            {t("settings.saveHostChangesHint")}
                          </div>
                        </div>
                      </div>

                      <button
                        id="settings-save"
                        type="button"
                        onClick={handleUpdateIdentity}
                        disabled={mutation.isPending}
                        className="panel-btn panel-btn--primary rounded-xl px-[22px] py-2.5 text-[13px]"
                      >
                        {mutation.isPending ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        {mutation.isPending
                          ? t("settings.saving")
                          : t("settings.saveSettings")}
                      </button>
                    </div>
                  </div>

                  {/* Language Preferences Card */}
                  <div className="panel-shell-card p-5">
                    <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_260px]">
                      <SectionHeader
                        icon={<Globe2 size={17} />}
                        title={t("settings.language.title")}
                        subtitle={t("settings.language.subtitle")}
                      />
                      <div className="flex flex-col gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                        {t("language.label")}
                        <PanelSelectMenu
                          id="settings-language-select"
                          value={language}
                          onChange={(value) => setLanguage(value as Language)}
                          options={[
                            { value: "id", label: t("language.indonesian") },
                            { value: "en", label: t("language.english") },
                          ]}
                          className="w-full"
                          buttonClassName="panel-input min-h-[44px] justify-between rounded-[14px] px-3.5 py-2 text-[14px] font-semibold"
                          dropdownClassName="left-auto right-0 z-[700] min-w-[190px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 2. Appearance & Desktop ── */}
              {activeTab === "appearance" && (
                <div className="space-y-4">
                  {/* Theme Mode Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <SectionHeader
                      icon={<Palette size={17} />}
                      title="Theme & Color Scheme"
                      subtitle="Pilih tema tampilan panel antara mode terang atau gelap"
                    />

                    <div className="grid grid-cols-2 gap-3.5 max-w-[480px]">
                      {/* Light Mode Option */}
                      <button
                        type="button"
                        onClick={() => setMode("light")}
                        className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border transition-all cursor-pointer text-center ${
                          mode === "light"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                          <Sun size={24} strokeWidth={2} />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--win-text)]">
                            Light Mode
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                            Tampilan bersih & cerah
                          </div>
                        </div>
                        {mode === "light" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2.5 py-0.5 text-[10.5px] font-bold text-white">
                            <CheckCircle2 size={11} /> Aktif
                          </span>
                        )}
                      </button>

                      {/* Dark Mode Option */}
                      <button
                        type="button"
                        onClick={() => setMode("dark")}
                        className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border transition-all cursor-pointer text-center ${
                          mode === "dark"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                          <Moon size={24} strokeWidth={2} />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--win-text)]">
                            Dark Mode
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                            Kontras tinggi & ramah mata
                          </div>
                        </div>
                        {mode === "dark" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2.5 py-0.5 text-[10.5px] font-bold text-white">
                            <CheckCircle2 size={11} /> Aktif
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Desktop Icon Style Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <SectionHeader
                      icon={<Layout size={17} />}
                      title={t("settings.iconStyle.title")}
                      subtitle={t("settings.iconStyle.subtitle")}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-[560px]">
                      {/* Framed Option */}
                      <button
                        type="button"
                        onClick={() => setDesktopIconStyle("framed")}
                        className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
                          desktopIconStyle === "framed"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/20 backdrop-blur-md border border-white/10 shadow-md shadow-black/20">
                          <Layout size={22} className="text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="text-[13px] font-semibold text-[var(--win-text)]">
                              {t("settings.iconStyle.framed")}
                            </div>
                            {desktopIconStyle === "framed" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                                <CheckCircle2 size={10} /> Aktif
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {t("settings.iconStyle.framedDesc")}
                          </div>
                        </div>
                      </button>

                      {/* Plain / Borderless Option */}
                      <button
                        type="button"
                        onClick={() => setDesktopIconStyle("plain")}
                        className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${
                          desktopIconStyle === "plain"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">
                          <Layout size={26} className="text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="text-[13px] font-semibold text-[var(--win-text)]">
                              {t("settings.iconStyle.plain")}
                            </div>
                            {desktopIconStyle === "plain" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-primary-solid)] px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                                <CheckCircle2 size={10} /> Aktif
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {t("settings.iconStyle.plainDesc")}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Desktop Icon Size Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <SectionHeader
                      icon={<Layout size={17} />}
                      title={t("settings.iconSize.title")}
                      subtitle={t("settings.iconSize.subtitle")}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 max-w-[620px]">
                      {/* Small Option */}
                      <button
                        type="button"
                        onClick={() => setDesktopIconSize("small")}
                        className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border transition-all cursor-pointer text-center ${
                          desktopIconSize === "small"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/20 backdrop-blur-md border border-white/10 shadow-sm text-sky-400">
                          <Layout size={18} />
                        </div>
                        <div className="w-full">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-[13px] font-semibold text-[var(--win-text)]">
                              {t("settings.iconSize.small")}
                            </span>
                            {desktopIconSize === "small" && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                                <CheckCircle2 size={9} />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {t("settings.iconSize.smallDesc")}
                          </div>
                        </div>
                      </button>

                      {/* Medium Option */}
                      <button
                        type="button"
                        onClick={() => setDesktopIconSize("medium")}
                        className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border transition-all cursor-pointer text-center ${
                          desktopIconSize === "medium"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/20 backdrop-blur-md border border-white/10 shadow-sm text-sky-400">
                          <Layout size={22} />
                        </div>
                        <div className="w-full">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-[13px] font-semibold text-[var(--win-text)]">
                              {t("settings.iconSize.medium")}
                            </span>
                            {desktopIconSize === "medium" && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                                <CheckCircle2 size={9} />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {t("settings.iconSize.mediumDesc")}
                          </div>
                        </div>
                      </button>

                      {/* Large Option */}
                      <button
                        type="button"
                        onClick={() => setDesktopIconSize("large")}
                        className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border transition-all cursor-pointer text-center ${
                          desktopIconSize === "large"
                            ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] shadow-md ring-2 ring-[var(--panel-primary-solid)]/30"
                            : "border-[var(--win-border)] bg-[var(--panel-surface)] hover:bg-[var(--panel-surface-hover)]"
                        }`}
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/20 backdrop-blur-md border border-white/10 shadow-sm text-sky-400">
                          <Layout size={26} />
                        </div>
                        <div className="w-full">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-[13px] font-semibold text-[var(--win-text)]">
                              {t("settings.iconSize.large")}
                            </span>
                            {desktopIconSize === "large" && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--panel-primary-solid)] px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                                <CheckCircle2 size={9} />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {t("settings.iconSize.largeDesc")}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Wallpaper Gallery Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SectionHeader
                        icon={<ImagePlus size={17} />}
                        title="Desktop Wallpaper"
                        subtitle="Pilih wallpaper preset gambar HD, gradient minimalis, atau unggah gambar kustom"
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleCustomWallpaperUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="panel-btn panel-btn--primary rounded-xl px-3.5 py-2 text-[12.5px] flex items-center gap-2"
                      >
                        <Upload size={14} />
                        Upload Wallpaper
                      </button>
                    </div>

                    {/* HD Image Wallpapers (Unsplash Pack) */}
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
                        HD Image Wallpapers
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {(
                          [
                            "server-datacenter",
                            "tokyo-night",
                            "dark-mountains",
                            "deep-nebula",
                            "nordic-forest",
                            "desert-dusk",
                            "minimal-architecture",
                            "abstract-wave",
                          ] as Array<Exclude<WallpaperKey, "custom">>
                        ).map((key) => {
                          const def = WALLPAPERS[key];
                          if (!def) return null;
                          const isActive = wallpaper === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setWallpaper(key)}
                              className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all cursor-pointer text-left ${
                                isActive
                                  ? "border-[var(--panel-primary-solid)] ring-2 ring-[var(--panel-primary-solid)]/40 shadow-md"
                                  : "border-[var(--win-border)] hover:border-[var(--panel-primary-solid)]/50"
                              }`}
                            >
                              <div
                                className="h-24 w-full bg-cover bg-center transition-transform duration-200 group-hover:scale-105"
                                style={{
                                  backgroundImage: `url("${def.previewUrl || def.light}")`,
                                }}
                              />
                              <div className="p-2.5 flex items-center justify-between bg-[var(--panel-surface)]">
                                <span className="text-[11.5px] font-semibold text-[var(--win-text)] truncate">
                                  {def.label}
                                </span>
                                {isActive && (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gradient Presets */}
                    <div>
                      <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
                        Gradient Minimalist
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {(
                          [
                            "default",
                            "ocean",
                            "sunset",
                            "forest",
                            "midnight",
                            "aurora",
                          ] as Array<Exclude<WallpaperKey, "custom">>
                        ).map((key) => {
                          const def = WALLPAPERS[key];
                          if (!def) return null;
                          const isActive = wallpaper === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setWallpaper(key)}
                              className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all cursor-pointer text-left ${
                                isActive
                                  ? "border-[var(--panel-primary-solid)] ring-2 ring-[var(--panel-primary-solid)]/40 shadow-md"
                                  : "border-[var(--win-border)] hover:border-[var(--panel-primary-solid)]/50"
                              }`}
                            >
                              <div
                                className="h-16 w-full transition-transform duration-200 group-hover:scale-105"
                                style={{
                                  background:
                                    mode === "dark"
                                      ? (def.dark ?? def.light)
                                      : def.light,
                                }}
                              />
                              <div className="p-2 flex items-center justify-between bg-[var(--panel-surface)]">
                                <span className="text-[11px] font-semibold text-[var(--win-text)] truncate">
                                  {def.label}
                                </span>
                                {isActive && (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" />
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {/* Custom Wallpaper Swatch */}
                        {customImageUrl && (
                          <button
                            type="button"
                            onClick={() => setWallpaper("custom")}
                            className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all cursor-pointer text-left ${
                              wallpaper === "custom"
                                ? "border-[var(--panel-primary-solid)] ring-2 ring-[var(--panel-primary-solid)]/40 shadow-md"
                                : "border-[var(--win-border)] hover:border-[var(--panel-primary-solid)]/50"
                            }`}
                          >
                            <div
                              className="h-16 w-full bg-cover bg-center transition-transform duration-200 group-hover:scale-105"
                              style={{
                                backgroundImage: `url("${customImageUrl}")`,
                              }}
                            />
                            <div className="p-2 flex items-center justify-between bg-[var(--panel-surface)]">
                              <span className="text-[11px] font-semibold text-[var(--win-text)] truncate">
                                Custom
                              </span>
                              {wallpaper === "custom" && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" />
                              )}
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sound & Audio Effects Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <SectionHeader
                      icon={<Volume2 size={17} />}
                      title="Sound Effects & Audio"
                      subtitle="Atur efek suara interaksi tombol, notifikasi sistem, dan audio umpan balik"
                    />

                    <div className="space-y-3 max-w-[560px]">
                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
                            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-[var(--win-text)]">
                              Enable System Sounds
                            </div>
                            <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                              Mainkan audio chime saat notifikasi masuk atau kunci layar
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSoundEnabled(!soundEnabled)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            soundEnabled
                              ? "bg-[var(--panel-primary-solid)]"
                              : "bg-gray-400/30"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              soundEnabled ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {soundEnabled && (
                        <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[12.5px] font-semibold text-[var(--win-text)]">
                              Sound Volume
                            </span>
                            <span className="panel-mono text-[12px] font-bold text-[var(--panel-primary-text)]">
                              {Math.round(soundVolume * 100)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={soundVolume}
                              onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-700/30 rounded-lg appearance-none cursor-pointer accent-[var(--panel-primary-solid)]"
                            />
                            <button
                              type="button"
                              onClick={() => soundManager.playNotification()}
                              className="panel-btn panel-btn--ghost text-[11.5px] whitespace-nowrap shrink-0 px-2.5 py-1"
                            >
                              Test Sound
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lock Screen & Security Timeout Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <SectionHeader
                      icon={<Lock size={17} />}
                      title="Lock Screen & Auto-Lock"
                      subtitle="Konfigurasi batas waktu kunci otomatis saat desktop tidak aktif"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-[560px]">
                      <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--win-text)]">
                            Auto-Lock Idle Timeout
                          </div>
                          <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                            Kunci desktop jika tidak ada aktivitas mouse / keyboard
                          </div>
                        </div>
                        <select
                          value={autoLockTimeout}
                          onChange={(e) => setAutoLockTimeout(parseInt(e.target.value, 10))}
                          className="panel-input text-[12.5px] py-1.5 px-3 rounded-lg w-full bg-[var(--panel-surface-hover)] text-[var(--win-text)] border border-[var(--win-border)]"
                        >
                          <option value={0}>Never (Nonaktif)</option>
                          <option value={5}>5 Menit</option>
                          <option value={15}>15 Menit</option>
                          <option value={30}>30 Menit</option>
                          <option value={60}>1 Jam</option>
                        </select>
                      </div>

                      <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--win-text)]">
                            Kunci Desktop Sekarang
                          </div>
                          <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                            Amankan sesi panel Anda saat meninggalkan meja kerja
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLocked(true)}
                          className="panel-btn panel-btn--primary text-[12px] py-2 px-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Lock size={14} />
                          <span>Kunci Layar</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Desktop & Dock Controls Card */}
                  <div className="panel-shell-card p-4.5 flex flex-col gap-4">
                    <SectionHeader
                      icon={<Layout size={17} />}
                      title="Desktop & Dock Preferences"
                      subtitle="Atur perilaku dock dan widget monitor performa pada taskbar"
                    />

                    <div className="space-y-3">
                      {/* Auto-hide Dock Toggle */}
                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--win-text)]">
                            Auto-Hide Dock
                          </div>
                          <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                            Sembunyikan dock secara otomatis saat jendela
                            didekatkan
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={toggleDockAutoHide}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            autoHideDock
                              ? "bg-[var(--panel-primary-solid)]"
                              : "bg-gray-400/30"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              autoHideDock ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* System Stats Monitor Toggle */}
                      <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[13px] font-semibold text-[var(--win-text)]">
                              Taskbar Resource Monitor
                            </div>
                            <div className="text-[11.5px] text-[var(--text-secondary)] mt-0.5">
                              Tampilkan indikator realtime CPU, RAM, dan
                              Temperatur di Taskbar
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowSystemStats(!showSystemStats)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              showSystemStats
                                ? "bg-[var(--panel-primary-solid)]"
                                : "bg-gray-400/30"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                showSystemStats
                                  ? "translate-x-5"
                                  : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        {showSystemStats && (
                          <div className="flex items-center gap-4 pt-2 border-t border-[var(--win-border)] text-[12px] text-[var(--win-text)]">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={systemStatsConfig.cpu}
                                onChange={(e) =>
                                  setSystemStatsConfig({
                                    ...systemStatsConfig,
                                    cpu: e.target.checked,
                                  })
                                }
                                className="rounded border-[var(--win-border)] text-[var(--panel-primary-solid)] focus:ring-0"
                              />
                              CPU Load
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={systemStatsConfig.ram}
                                onChange={(e) =>
                                  setSystemStatsConfig({
                                    ...systemStatsConfig,
                                    ram: e.target.checked,
                                  })
                                }
                                className="rounded border-[var(--win-border)] text-[var(--panel-primary-solid)] focus:ring-0"
                              />
                              RAM Usage
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={systemStatsConfig.temp}
                                onChange={(e) =>
                                  setSystemStatsConfig({
                                    ...systemStatsConfig,
                                    temp: e.target.checked,
                                  })
                                }
                                className="rounded border-[var(--win-border)] text-[var(--panel-primary-solid)] focus:ring-0"
                              />
                              Temperature
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 3. Cloudflare Integration ── */}
              {activeTab === "cloudflare" && (
                <div className="space-y-4">
                  <div className="panel-shell-card p-5">
                    <SectionHeader
                      icon={<Cloud size={17} />}
                      title="Cloudflare API & Credentials"
                      subtitle="Konfigurasi API Token dan kredensial Cloudflare untuk tunnel otomatis dan sinkronisasi DNS"
                    />

                    {cfQuery.isLoading ? (
                      <div className="py-12 text-center text-[13px] text-[var(--text-secondary)] flex items-center justify-center gap-2">
                        <LoaderCircle
                          size={16}
                          className="animate-spin text-[var(--panel-primary-text)]"
                        />
                        <span>Memuat konfigurasi Cloudflare...</span>
                      </div>
                    ) : cf?.configured ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                              Status Koneksi
                            </div>
                            <div className="mt-1 text-[14px] font-bold text-[var(--win-text)] flex items-center gap-2">
                              <Cloud
                                size={16}
                                className="text-[var(--panel-primary-text)]"
                              />
                              Akun Cloudflare Terhubung
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
                              cf.status === "active"
                                ? "bg-[var(--panel-success-bg)] text-[var(--panel-success-text)]"
                                : cf.status === "invalid"
                                  ? "bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)]"
                                  : "bg-[var(--panel-warning-bg)] text-[var(--panel-warning-text)]"
                            }`}
                          >
                            {cf.status === "active" ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <AlertTriangle size={13} />
                            )}
                            {cf.status === "active"
                              ? "Terverifikasi"
                              : cf.status === "invalid"
                                ? "Token Tidak Valid"
                                : "Belum Diverifikasi"}
                          </span>
                        </div>

                        <div className="space-y-2.5 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 text-[12.5px]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[var(--text-secondary)]">
                              Account ID
                            </span>
                            <code className="panel-mono text-[var(--win-text)] font-semibold">
                              {cf.accountId || "—"}
                            </code>
                          </div>
                          {cf.zoneId && (
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)]/50 pt-2">
                              <span className="text-[var(--text-secondary)]">
                                Zone ID
                              </span>
                              <code className="panel-mono text-[var(--win-text)]">
                                {cf.zoneId}
                              </code>
                            </div>
                          )}
                          {cf.baseDomain && (
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)]/50 pt-2">
                              <span className="text-[var(--text-secondary)]">
                                Base Domain
                              </span>
                              <code className="panel-mono text-[var(--win-text)]">
                                {cf.baseDomain}
                              </code>
                            </div>
                          )}
                          {cf.verifiedAt && (
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--win-border)]/50 pt-2">
                              <span className="text-[var(--text-secondary)]">
                                Terakhir Diverifikasi
                              </span>
                              <span className="text-[var(--win-text)]">
                                {new Date(cf.verifiedAt).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => verifyCFMut.mutate()}
                            disabled={verifyCFMut.isPending}
                            className="panel-btn panel-btn--primary rounded-xl px-4 py-2.5 text-[13px] flex items-center gap-2"
                          >
                            {verifyCFMut.isPending ? (
                              <LoaderCircle
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <ShieldCheck size={14} />
                            )}
                            {verifyCFMut.isPending
                              ? "Memverifikasi..."
                              : "Verifikasi Ulang Token"}
                          </button>

                          <button
                            type="button"
                            onClick={handleDeleteCloudflare}
                            disabled={deleteCFMut.isPending}
                            className="panel-btn border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-bg)] rounded-xl px-4 py-2.5 text-[13px] flex items-center gap-2 ml-auto"
                          >
                            <Trash2 size={14} />
                            Hapus Kredensial
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Permission Guidance Banner */}
                        <div className="rounded-2xl border border-[var(--panel-primary-text)]/20 bg-[var(--panel-primary-bg)] p-4 text-[12px] leading-relaxed">
                          <div className="flex items-start gap-3">
                            <Cloud className="h-5 w-5 text-[var(--panel-primary-text)] shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-[var(--win-text)] text-[13px]">
                                Panduan Izin Cloudflare API Token
                              </div>
                              <p className="mt-1 text-[var(--text-secondary)]">
                                Buat API Token khusus di Cloudflare Dashboard
                                dengan izin akses berikut:
                              </p>
                              <ul className="list-disc pl-4 mt-2 space-y-1 font-medium text-[var(--panel-primary-text)]">
                                <li>Account → Cloudflare Tunnel → Edit</li>
                                <li>Zone → Zone → Edit & Read</li>
                                <li>Zone → DNS → Edit</li>
                              </ul>
                              <div className="mt-3">
                                <a
                                  href="https://dash.cloudflare.com/profile/api-tokens"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold underline underline-offset-2 text-[var(--panel-primary-text)] hover:brightness-110"
                                >
                                  Buka Cloudflare API Tokens Dashboard ↗
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <FieldLabel
                              label="API Token (Wajib)"
                              hint="Permissions: Tunnel & DNS"
                            />
                            <div className="relative">
                              <input
                                type={showCfToken ? "text" : "password"}
                                placeholder="Contoh: vL_dF83..."
                                value={cfForm.apiToken}
                                onChange={(e) =>
                                  setCfForm((f) => ({
                                    ...f,
                                    apiToken: e.target.value,
                                  }))
                                }
                                className="panel-input panel-input--mono h-[42px] px-3.5 pr-10 text-[13px]"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCfToken((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
                              >
                                {showCfToken ? (
                                  <EyeOff size={15} />
                                ) : (
                                  <Eye size={15} />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <FieldLabel
                                label="Account ID (Wajib)"
                                hint="Account overview"
                              />
                              <input
                                value={cfForm.accountId}
                                onChange={(e) =>
                                  setCfForm((f) => ({
                                    ...f,
                                    accountId: e.target.value,
                                  }))
                                }
                                placeholder="Contoh: 9a8b7c6d..."
                                className="panel-input panel-input--mono h-[42px] px-3.5 text-[13px]"
                              />
                            </div>

                            <div>
                              <FieldLabel
                                label="Zone ID (Opsional)"
                                hint="Domain overview"
                              />
                              <input
                                value={cfForm.zoneId}
                                onChange={(e) =>
                                  setCfForm((f) => ({
                                    ...f,
                                    zoneId: e.target.value,
                                  }))
                                }
                                placeholder="Contoh: 1a2b3c4d..."
                                className="panel-input panel-input--mono h-[42px] px-3.5 text-[13px]"
                              />
                            </div>

                            <div>
                              <FieldLabel
                                label="Base Domain (Opsional)"
                                hint="contoh.com"
                              />
                              <input
                                value={cfForm.baseDomain}
                                onChange={(e) =>
                                  setCfForm((f) => ({
                                    ...f,
                                    baseDomain: e.target.value,
                                  }))
                                }
                                placeholder="domainanda.com"
                                className="panel-input panel-input--mono h-[42px] px-3.5 text-[13px]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[var(--win-border)] flex items-center justify-between">
                          <span className="text-[12px] text-[var(--text-secondary)]">
                            Token akan langsung divalidasi setelah disimpan
                          </span>
                          <button
                            type="button"
                            onClick={() => saveCFMut.mutate(cfForm)}
                            disabled={
                              saveCFMut.isPending ||
                              !cfForm.apiToken.trim() ||
                              !cfForm.accountId.trim()
                            }
                            className="panel-btn panel-btn--primary rounded-xl px-5 py-2.5 text-[13px] flex items-center gap-2"
                          >
                            {saveCFMut.isPending ? (
                              <LoaderCircle
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Save size={14} />
                            )}
                            {saveCFMut.isPending
                              ? "Menyimpan & Menghubungkan..."
                              : "Simpan & Verifikasi"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 4. Network & Ports ── */}
              {activeTab === "network" && (
                <div className="space-y-4">
                  <div className="panel-shell-card p-5">
                    <SectionHeader
                      icon={<LockKeyhole size={17} />}
                      title={t("settings.runtimePanelPort")}
                      subtitle={t("settings.runtimePanelPortSubtitle")}
                    />

                    <div className="space-y-3.5">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <FieldLabel
                            label={t("settings.activeBindAddress")}
                            hint={t("settings.readOnly")}
                          />
                          <input
                            id="settings-bind-addr"
                            value={query.data.bindAddr}
                            readOnly
                            className="panel-input panel-input--mono h-[42px] px-3.5 text-[12px] opacity-80"
                          />
                        </div>
                        <div>
                          <FieldLabel
                            label={t("settings.panelPort")}
                            hint="1-65535"
                          />
                          <input
                            id="settings-panel-port"
                            inputMode="numeric"
                            value={panelPort}
                            onChange={(event) =>
                              setPanelPort(
                                event.target.value.replace(/[^0-9]/g, ""),
                              )
                            }
                            className="panel-input panel-input--mono h-[42px] px-3.5 text-[12px]"
                            placeholder={t("settings.portPlaceholder")}
                          />
                        </div>
                      </div>

                      <div className="panel-muted-block rounded-[14px] px-4 py-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                        <div>
                          <strong className="text-[var(--win-text)]">
                            {t("settings.allowedHosts")}:
                          </strong>{" "}
                          {(query.data.allowedHosts ?? []).length
                            ? (query.data.allowedHosts ?? []).join(", ")
                            : "—"}
                        </div>
                        <div>
                          <strong className="text-[var(--win-text)]">
                            {t("settings.activeOrigins")}:
                          </strong>{" "}
                          {(query.data.allowedOrigins ?? []).length
                            ? (query.data.allowedOrigins ?? []).join(", ")
                            : "—"}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          id="settings-panel-port-save"
                          type="button"
                          onClick={handleUpdatePanelPort}
                          disabled={
                            panelPortMutation.isPending || !panelPort.trim()
                          }
                          className="panel-btn panel-btn--primary rounded-xl px-[18px] py-2.5 text-[13px]"
                        >
                          {panelPortMutation.isPending ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Waypoints size={14} />
                          )}
                          {panelPortMutation.isPending
                            ? t("settings.changingPort")
                            : t("settings.savePort")}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="panel-shell-card p-5">
                    <SectionHeader
                      icon={<ShieldCheck size={17} />}
                      title={t("settings.allowedOrigins")}
                      subtitle={t("settings.allowedOriginsSubtitle")}
                    />

                    <div className="space-y-3.5">
                      <div className="panel-muted-block rounded-[16px] p-3">
                        <textarea
                          id="settings-allowed-origins"
                          value={allowedOriginsText}
                          onChange={(event) =>
                            setAllowedOriginsText(event.target.value)
                          }
                          spellCheck={false}
                          className="panel-textarea panel-input--mono min-h-[220px] rounded-[12px] px-4 py-3 text-[12px] leading-6"
                          placeholder={
                            "http://127.0.0.1:80\nhttp://panel.domain.local:80"
                          }
                        />
                      </div>

                      <div className="panel-empty min-h-[92px] rounded-[14px] px-4 py-3 text-[12px] leading-6">
                        <span>
                          {t("settings.originsTipPrefix")}{" "}
                          <code className="panel-mono text-[12px] text-[var(--win-text)]">
                            http://127.0.0.1:80
                          </code>{" "}
                          {t("settings.originsTipOr")}{" "}
                          <code className="panel-mono text-[12px] text-[var(--win-text)]">
                            https://panel.example.com:443
                          </code>
                          .
                        </span>
                      </div>

                      <div className="flex justify-end">
                        <button
                          id="settings-panel-origins-save"
                          type="button"
                          onClick={handleUpdateOrigins}
                          disabled={panelOriginsMutation.isPending}
                          className="panel-btn panel-btn--primary rounded-xl px-[18px] py-2.5 text-[13px]"
                        >
                          {panelOriginsMutation.isPending ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                          {panelOriginsMutation.isPending
                            ? t("settings.savingOrigins")
                            : t("settings.saveOrigins")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 3. Security & Passwords ── */}
              {activeTab === "security" && (
                <div className="space-y-4">
                  <div className="panel-shell-card p-5">
                    <SectionHeader
                      icon={<LockKeyhole size={17} />}
                      title={t("settings.primaryPasswordTitle")}
                      subtitle={t("settings.primaryPasswordSubtitle")}
                    />

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-3.5">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <FieldLabel
                              label={t("settings.newPassword")}
                              hint={t("settings.minEightChars")}
                            />
                            <input
                              id="settings-primary-password"
                              type="password"
                              value={primaryPassword}
                              onChange={(event) =>
                                setPrimaryPassword(event.target.value)
                              }
                              className="panel-input h-[42px] px-3.5 text-[13px]"
                              placeholder={t("settings.enterNewPassword")}
                            />
                          </div>
                          <div>
                            <FieldLabel
                              label={t("settings.confirmPassword")}
                              hint={t("settings.mustMatch")}
                            />
                            <input
                              id="settings-primary-password-confirm"
                              type="password"
                              value={primaryPasswordConfirm}
                              onChange={(event) =>
                                setPrimaryPasswordConfirm(event.target.value)
                              }
                              className="panel-input h-[42px] px-3.5 text-[13px]"
                              placeholder={t("settings.repeatNewPassword")}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            id="settings-primary-password-save"
                            type="button"
                            onClick={handleResetPrimaryPassword}
                            disabled={
                              resetPrimaryPasswordMutation.isPending ||
                              !primaryPassword.trim() ||
                              !primaryPasswordConfirm.trim()
                            }
                            className="panel-btn panel-btn--primary rounded-xl px-[18px] py-2.5 text-[13px]"
                          >
                            {resetPrimaryPasswordMutation.isPending ? (
                              <LoaderCircle
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <LockKeyhole size={14} />
                            )}
                            {resetPrimaryPasswordMutation.isPending
                              ? t("settings.changingPassword")
                              : t("settings.changePrimaryPassword")}
                          </button>
                        </div>
                      </div>

                      <div className="panel-muted-block rounded-[16px] px-4 py-4 text-[12px] leading-6 text-[var(--text-secondary)]">
                        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--win-text)]">
                          {t("settings.runtimeSecurityNote")}
                        </div>
                        <p>
                          {t("settings.primaryPasswordSecurityNoteStart")}{" "}
                          <strong className="text-[var(--win-text)]">
                            {t("settings.panelLoginPassword")}
                          </strong>{" "}
                          {t("settings.primaryPasswordSecurityNoteEnd")}
                          {t("settings.linuxUserPasswordNote")}{" "}
                          <code className="panel-mono text-[12px] text-[var(--win-text)]">
                            ui-panel
                          </code>{" "}
                          {t("settings.notChanged")}.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="panel-shell-card p-5">
                    <SectionHeader
                      icon={<Database size={17} />}
                      title={t("settings.databaseTitle")}
                      subtitle={t("settings.databaseSubtitle")}
                    />

                    <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <div className="panel-muted-block px-4 py-3.5">
                        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {t("settings.connection")}
                        </div>
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${databaseQuery.data?.status.connected ? "bg-[var(--panel-success-text)]" : "bg-[var(--panel-danger-text)]"}`}
                          />
                          <span className="text-[13px] font-semibold text-[var(--win-text)]">
                            {databaseQuery.data?.status.connected
                              ? t("common.connected")
                              : databaseQuery.data?.status.enabled
                                ? t("settings.unavailable")
                                : t("settings.disabled")}
                          </span>
                        </div>
                        <div className="break-all text-[12px] leading-5 text-[var(--text-secondary)]">
                          {databaseQuery.data?.status.connected
                            ? `${databaseQuery.data.status.user}@${databaseQuery.data.status.host}:${databaseQuery.data.status.port}`
                            : databaseQuery.data?.status.lastError || "—"}
                        </div>
                      </div>

                      <div className="panel-muted-block px-4 py-3.5">
                        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {t("settings.rows")}
                        </div>
                        <div className="mb-1 text-[13px] font-semibold text-[var(--win-text)]">
                          {databaseQuery.data
                            ? t("settings.databaseRowsSummary", {
                                logs: databaseQuery.data.status.runtimeLogCount,
                                changelog:
                                  databaseQuery.data.status.changelogCount,
                              })
                            : "—"}
                        </div>
                        <div className="text-[12px] text-[var(--text-secondary)]">
                          {t("settings.auditRows", {
                            count:
                              databaseQuery.data?.status.settingsAuditCount ??
                              0,
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="panel-muted-block rounded-[14px] px-4 py-3.5">
                      <div
                        className={`flex flex-wrap items-center justify-between gap-3 ${dbResetResult ? "mb-3" : ""}`}
                      >
                        <div>
                          <div className="mb-0.5 text-[13px] font-semibold text-[var(--win-text)]">
                            {t("settings.resetDatabasePassword")}
                          </div>
                          <div className="text-[12px] text-[var(--text-secondary)]">
                            {t("settings.resetDatabasePasswordHint")}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            id="settings-db-refresh"
                            type="button"
                            onClick={() => void databaseQuery.refetch()}
                            className="panel-btn panel-btn--ghost rounded-[10px] px-3.5 py-2 text-[12px]"
                          >
                            <RefreshCcw
                              size={13}
                              className={
                                databaseQuery.isFetching ? "animate-spin" : ""
                              }
                            />
                            {t("common.refresh")}
                          </button>

                          <button
                            id="settings-db-reset-password"
                            type="button"
                            onClick={handleResetDatabase}
                            disabled={
                              resetDatabaseMutation.isPending ||
                              !databaseQuery.data?.status.enabled
                            }
                            className="panel-btn panel-btn--primary rounded-[10px] px-3.5 py-2 text-[12px]"
                          >
                            {resetDatabaseMutation.isPending ? (
                              <LoaderCircle
                                size={13}
                                className="animate-spin"
                              />
                            ) : (
                              <Database size={13} />
                            )}
                            {resetDatabaseMutation.isPending
                              ? t("settings.resetting")
                              : t("settings.resetPassword")}
                          </button>
                        </div>
                      </div>

                      {dbResetResult ? (
                        <div className="panel-shell-card border-[color:var(--panel-success-border)] bg-[color:var(--panel-success-bg)] px-3.5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div>
                              <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--panel-success-text)]">
                                {t("settings.database.newPasswordLabel")}
                              </div>
                              <code className="panel-mono break-all text-[13px] font-semibold text-[var(--panel-success-text)]">
                                {dbResetResult.password}
                              </code>
                            </div>
                            <button
                              id="settings-db-copy-password"
                              type="button"
                              onClick={async () => {
                                try {
                                  await copyTextToClipboard(
                                    dbResetResult.password,
                                  );
                                  alertLib.fire(
                                    t("settings.database.passwordCopiedTitle"),
                                    t(
                                      "settings.database.passwordCopiedMessage",
                                    ),
                                    "success",
                                    "settings",
                                  );
                                } catch (error: any) {
                                  alertLib.fire(
                                    t("settings.database.copyFailedTitle"),
                                    error?.message ||
                                      t("settings.database.copyFailedMessage"),
                                    "error",
                                    "settings",
                                  );
                                }
                              }}
                              className="panel-btn panel-btn--ghost rounded-[10px] px-3.5 py-[7px] text-[12px]"
                            >
                              <Copy size={13} />
                              {t("common.copy")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* ── 4. Payment Gateway ── */}
              {activeTab === "payment" && (
                <div className="panel-shell-card p-5">
                  <SectionHeader
                    icon={<CreditCard size={17} />}
                    title={t("settings.paymentGateway")}
                    subtitle={t("settings.paymentGatewaySubtitle")}
                  />

                  {paymentQuery.isLoading ? (
                    <div className="panel-loading min-h-[80px]">
                      <LoaderCircle size={16} className="animate-spin" />
                      {t("settings.loadingPaymentGateway")}
                    </div>
                  ) : !paymentSettingsList.length ? (
                    <div className="panel-empty min-h-[80px] text-[12px]">
                      <span>{t("settings.noPaymentGatewayConfig")}</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const settings = paymentSettingsList;
                        const midtrans = settings.filter((s) =>
                          s.key.startsWith("midtrans_"),
                        );
                        const xendit = settings.filter((s) =>
                          s.key.startsWith("xendit_"),
                        );

                        const renderGatewayGroup = (
                          title: string,
                          icon: React.ReactNode,
                          colorClass: string,
                          items: typeof settings,
                        ) => (
                          <div>
                            <div className="mb-3 flex items-center gap-2">
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${colorClass}`}
                              >
                                {icon}
                              </span>
                              <span className="text-[13px] font-bold text-[var(--win-text)]">
                                {title}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                              {items.map((setting) => {
                                const isMasked =
                                  setting.isSecret && !showSecrets[setting.key];
                                const isChanged =
                                  paymentSettings[setting.key] !==
                                  originalPaymentSettings[setting.key];
                                return (
                                  <div key={setting.key}>
                                    <div className="mb-1.5 flex items-center justify-between gap-3">
                                      <span className="text-[12px] font-semibold text-[var(--win-text)]">
                                        {setting.label}
                                      </span>
                                      <span className="panel-mono text-[12px] text-[var(--text-secondary)]">
                                        {setting.key}
                                      </span>
                                    </div>
                                    <div className="relative">
                                      <input
                                        id={`payment-${setting.key}`}
                                        type={isMasked ? "password" : "text"}
                                        value={
                                          paymentSettings[setting.key] || ""
                                        }
                                        onChange={(e) =>
                                          setPaymentSettings((prev) => ({
                                            ...prev,
                                            [setting.key]: e.target.value,
                                          }))
                                        }
                                        className={`panel-input panel-input--mono h-[42px] px-3.5 pr-10 text-[12px] ${isChanged ? "ring-2 ring-[var(--panel-accent)]" : ""}`}
                                        placeholder={setting.description}
                                      />
                                      {setting.isSecret ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setShowSecrets((prev) => ({
                                              ...prev,
                                              [setting.key]: !prev[setting.key],
                                            }))
                                          }
                                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--win-text)] transition-colors"
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
                                    </div>
                                    <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
                                      {setting.description}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );

                        return (
                          <div className="space-y-6">
                            {midtrans.length
                              ? renderGatewayGroup(
                                  "Midtrans",
                                  <Zap size={14} />,
                                  "bg-[var(--panel-warning-bg)] text-[var(--panel-warning-text)]",
                                  midtrans,
                                )
                              : null}
                            {xendit.length
                              ? renderGatewayGroup(
                                  "Xendit",
                                  <Globe2 size={14} />,
                                  "bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]",
                                  xendit,
                                )
                              : null}
                          </div>
                        );
                      })()}

                      <div className="border-t border-[var(--win-border)] pt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="panel-muted-block flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--win-text)]">
                            <CreditCard size={18} />
                          </div>
                          <div>
                            <div className="text-[14px] font-semibold text-[var(--win-text)]">
                              {t("settings.saveGatewayConfig")}
                            </div>
                            <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                              {t("settings.saveGatewayConfigHint")}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            id="payment-test-gateway"
                            type="button"
                            onClick={() => testGatewayMutation.mutate()}
                            disabled={testGatewayMutation.isPending}
                            className="panel-btn panel-btn--ghost rounded-xl px-[18px] py-2.5 text-[13px]"
                          >
                            {testGatewayMutation.isPending ? (
                              <LoaderCircle
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Wifi size={14} />
                            )}
                            {testGatewayMutation.isPending
                              ? t("settings.testing")
                              : t("settings.testConnection")}
                          </button>
                          <button
                            id="payment-save-settings"
                            type="button"
                            onClick={handleSavePaymentSettings}
                            disabled={paymentMutation.isPending}
                            className="panel-btn panel-btn--primary rounded-xl px-[22px] py-2.5 text-[13px]"
                          >
                            {paymentMutation.isPending ? (
                              <LoaderCircle
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Save size={14} />
                            )}
                            {paymentMutation.isPending
                              ? t("settings.saving")
                              : t("common.save")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 5. Push Notifications & Listener ── */}
              {activeTab === "notifications" && (
                <div className="panel-shell-card overflow-hidden p-0">
                  <div className="relative border-b border-[var(--border-subtle)] bg-[var(--panel-accent-gradient)] p-5">
                    <div className="absolute right-5 top-5 hidden rounded-full bg-[var(--panel-elevated-surface)] p-3 shadow-[var(--panel-soft-shadow)] backdrop-blur md:block">
                      <Smartphone
                        size={24}
                        className="text-[var(--panel-primary-text)]"
                      />
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-3 pr-0 md:pr-16">
                      <SectionHeader
                        icon={<Smartphone size={17} />}
                        title={t("settings.listener.title")}
                        subtitle={t("settings.listener.subtitle")}
                      />
                      <div
                        className={`panel-badge ${capturedWS.connected ? "panel-badge--success" : "panel-badge--warning"} mt-1 flex items-center gap-1.5`}
                      >
                        <span
                          className={`panel-status-dot ${capturedWS.connected ? "bg-[var(--panel-success-text)]" : "bg-[var(--panel-warning-text)]"}`}
                        />
                        {capturedWS.connected
                          ? t("settings.listener.realtimeConnected")
                          : t("settings.listener.realtimeReconnecting")}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                      <div className="panel-muted-block rounded-[14px] px-3.5 py-3">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                          {t("settings.listener.stepRegisterDevice")}
                        </div>
                        <code className="panel-mono mt-1 block break-all text-[12px] text-[var(--win-text)]">
                          POST {listenerRegisterUrl}
                        </code>
                        <button
                          type="button"
                          className="panel-btn panel-btn--ghost mt-2 rounded-lg px-3 py-2 text-[12px]"
                          onClick={() =>
                            void copyTextToClipboard(listenerRegisterUrl)
                          }
                        >
                          <Copy size={11} /> {t("settings.listener.copyUrl")}
                        </button>
                      </div>
                      <div className="panel-muted-block rounded-[14px] px-3.5 py-3">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                          {t("settings.listener.stepSendNotification")}
                        </div>
                        <code className="panel-mono mt-1 block break-all text-[12px] text-[var(--win-text)]">
                          POST {listenerWebhookUrl}
                        </code>
                        <button
                          type="button"
                          className="panel-btn panel-btn--ghost mt-2 rounded-lg px-3 py-2 text-[12px]"
                          onClick={() =>
                            void copyTextToClipboard(listenerWebhookUrl)
                          }
                        >
                          <Copy size={11} /> {t("settings.listener.copyUrl")}
                        </button>
                      </div>
                      <div className="panel-muted-block rounded-[14px] px-3.5 py-3">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                          {t("settings.listener.stepRealtimeAdmin")}
                        </div>
                        <code className="panel-mono mt-1 block break-all text-[12px] text-[var(--win-text)]">
                          GET {listenerSocketUrl}
                        </code>
                        <button
                          type="button"
                          className="panel-btn panel-btn--ghost mt-2 rounded-lg px-3 py-2 text-[12px]"
                          onClick={() =>
                            void copyTextToClipboard(listenerSocketUrl)
                          }
                        >
                          <Copy size={11} /> {t("settings.listener.copyWs")}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-[var(--panel-elevated-border)] bg-[var(--panel-elevated-surface)] p-4 shadow-[var(--panel-soft-shadow)] backdrop-blur">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-bold text-[var(--win-text)]">
                            {t("settings.listener.manageTitle")}
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                            {t("settings.listener.manageSubtitle")}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="panel-btn panel-btn--ghost rounded-xl px-3 py-2 text-[12px]"
                          onClick={() =>
                            setListenerApiKey(
                              `ypnl_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
                            )
                          }
                        >
                          <RefreshCcw size={12} />{" "}
                          {t("settings.listener.generateKey")}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_160px]">
                        <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                          {t("settings.listener.deviceId")}
                          <input
                            id="notification-device-id"
                            value={listenerDeviceId}
                            onChange={(event) =>
                              setListenerDeviceId(event.target.value)
                            }
                            placeholder={t(
                              "settings.listener.deviceIdPlaceholder",
                            )}
                            className="panel-input text-[14px]"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                          {t("settings.listener.newApiKey")}
                          <input
                            id="notification-device-api-key"
                            type="password"
                            value={listenerApiKey}
                            onChange={(event) =>
                              setListenerApiKey(event.target.value)
                            }
                            placeholder={t(
                              "settings.listener.newApiKeyPlaceholder",
                            )}
                            className="panel-input text-[14px]"
                          />
                        </label>
                        <div className="flex flex-col gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
                          {t("settings.listener.status")}
                          <PanelSelectMenu
                            id="notification-device-status"
                            value={listenerStatus}
                            onChange={setListenerStatus}
                            options={[
                              { value: "active", label: "active" },
                              { value: "inactive", label: "inactive" },
                              { value: "blocked", label: "blocked" },
                            ]}
                            className="w-full"
                            buttonClassName="panel-input min-h-[44px] justify-between rounded-[14px] px-3.5 py-2 text-[14px] font-semibold"
                            dropdownClassName="left-auto right-0 z-[700] min-w-[180px]"
                          />
                        </div>
                        <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[var(--text-secondary)] xl:col-span-3">
                          {t("settings.listener.packageFilter")}{" "}
                          <span className="font-normal opacity-70">
                            {t("settings.listener.packageHint")}
                          </span>
                          <input
                            id="notification-device-package-filter"
                            value={listenerPackageFilter}
                            onChange={(event) =>
                              setListenerPackageFilter(event.target.value)
                            }
                            placeholder={t(
                              "settings.listener.packageFilterPlaceholder",
                            )}
                            className="panel-input text-[14px]"
                          />
                        </label>
                      </div>

                      <p
                        id="notification-device-api-key-help"
                        className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]"
                      >
                        {t("settings.listener.apiKeyHelp")}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          id="notification-save-api-key"
                          type="button"
                          onClick={handleSaveListenerDevice}
                          disabled={registerDeviceMutation.isPending}
                          className="panel-btn panel-btn--primary rounded-xl px-4 py-2.5 text-[12px]"
                        >
                          {registerDeviceMutation.isPending ? (
                            <LoaderCircle size={13} className="animate-spin" />
                          ) : (
                            <Save size={13} />
                          )}
                          {t("settings.listener.saveApiKey")}
                        </button>
                        <button
                          id="notification-update-device-meta"
                          type="button"
                          onClick={handleUpdateListenerMetadata}
                          disabled={updateDeviceMutation.isPending}
                          className="panel-btn panel-btn--ghost rounded-xl"
                        >
                          {updateDeviceMutation.isPending ? (
                            <LoaderCircle size={13} className="animate-spin" />
                          ) : (
                            <BadgeCheck size={13} />
                          )}
                          {t("settings.listener.updateMeta")}
                        </button>
                        <button
                          type="button"
                          className="panel-btn panel-btn--ghost rounded-xl"
                          onClick={() =>
                            void copyTextToClipboard(listenerApiKey)
                          }
                          disabled={!listenerApiKey}
                        >
                          <Copy size={13} /> {t("settings.listener.copyNewKey")}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                      <div className="rounded-[16px] border border-[var(--panel-elevated-border)] bg-[var(--panel-elevated-surface)] p-3.5 backdrop-blur">
                        <div className="mb-2 text-[12px] font-bold text-[var(--win-text)]">
                          {t("settings.listener.registerBodyTitle")}
                        </div>
                        <pre className="panel-mono overflow-x-auto rounded-[12px] bg-[var(--panel-code-bg)] p-3 text-[12px] leading-5 text-[var(--panel-code-text)]">{`{
  "deviceId": "wimboro-device-001",
  "apiKey": "buat-api-key-random-di-app",
  "packageFilter": ["com.whatsapp", "id.dana", "com.gojek.gopay"]
}`}</pre>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                          {t("settings.listener.registerBodyHelpStart")}{" "}
                          <b>apiKey</b>{" "}
                          {t("settings.listener.registerBodyHelpEnd")}
                        </p>
                      </div>
                      <div className="rounded-[16px] border border-[var(--panel-elevated-border)] bg-[var(--panel-elevated-surface)] p-3.5 backdrop-blur">
                        <div className="mb-2 text-[12px] font-bold text-[var(--win-text)]">
                          {t("settings.listener.webhookBodyTitle")}
                        </div>
                        <pre className="panel-mono overflow-x-auto rounded-[12px] bg-[var(--panel-code-bg)] p-3 text-[12px] leading-5 text-[var(--panel-code-text)]">{`Header:
X-API-Key: <apiKey device>

Body:
{
  "packageName": "id.dana",
  "appName": "DANA",
  "title": "${t("settings.listener.exampleTitle")}",
  "text": "${t("settings.listener.exampleText")}",
  "amountDetected": "25000"
}`}</pre>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                          {t("settings.listener.webhookBodyHelpStart")}{" "}
                          <b>X-API-Key</b>{" "}
                          {t("settings.listener.webhookBodyHelpEnd")}{" "}
                          <code>?api_key=...</code>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 items-stretch gap-4 p-5 xl:grid-cols-2">
                    {/* Devices */}
                    <div className="flex h-full min-h-[190px] flex-col">
                      <div className="mb-2.5 flex min-h-[44px] items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {t("settings.listener.registeredDevices")}
                        </span>
                        <span className="panel-badge panel-badge--info">
                          {t("settings.listener.deviceCount", {
                            count: notificationDevices.length,
                          })}
                        </span>
                      </div>
                      {notificationDevicesQuery.isLoading ? (
                        <div className="panel-loading min-h-[80px]">
                          <LoaderCircle size={16} className="animate-spin" />
                        </div>
                      ) : !notificationDevices.length ? (
                        <div className="panel-empty flex-1 min-h-[150px] text-[12px]">
                          <Smartphone size={26} />
                          <span>{t("settings.listener.noDevices")}</span>
                        </div>
                      ) : (
                        <div className="flex max-h-[340px] min-h-[150px] flex-1 flex-col gap-2 overflow-y-auto pr-1">
                          {notificationDevices.map((device) => (
                            <div
                              key={device.id}
                              className="panel-muted-block flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 transition hover:-translate-y-[1px] hover:shadow-[var(--panel-hover-shadow)]"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="rounded-xl bg-[var(--panel-primary-soft)] p-2 text-[var(--panel-primary-text)]">
                                  <Smartphone size={16} />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-[12px] font-semibold text-[var(--win-text)]">
                                    {device.deviceId}
                                  </div>
                                  <div className="truncate text-[12px] text-[var(--text-secondary)]">
                                    {(device.packageFilter ?? []).length
                                      ? (device.packageFilter ?? []).join(", ")
                                      : t("settings.listener.allPackages")}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-1.5">
                                <span
                                  className={`panel-status-dot ${
                                    device.status === "active"
                                      ? "bg-[var(--panel-success-text)]"
                                      : device.status === "inactive"
                                        ? "bg-[var(--text-secondary)]"
                                        : "bg-[var(--panel-danger-text)]"
                                  }`}
                                />
                                <span className="text-[12px] text-[var(--text-secondary)]">
                                  {device.status}
                                </span>
                                <button
                                  type="button"
                                  className="panel-btn panel-btn--ghost ml-1 rounded-lg px-3 py-2 text-[12px]"
                                  onClick={() =>
                                    handleUseDeviceForEdit(
                                      device.deviceId,
                                      device.packageFilter ?? [],
                                      device.status,
                                    )
                                  }
                                >
                                  {t("common.edit")}
                                </button>
                                <button
                                  type="button"
                                  className="panel-btn panel-btn--ghost rounded-lg px-3 py-2 text-[12px] text-[var(--panel-danger-text)]"
                                  onClick={() =>
                                    void handleDeleteListenerDevice(
                                      device.deviceId,
                                    )
                                  }
                                  disabled={deleteDeviceMutation.isPending}
                                >
                                  {t("common.delete")}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex h-full min-h-[190px] flex-col">
                      <div className="mb-2.5 flex min-h-[44px] items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {t("settings.listener.latestNotifications")}
                        </span>
                        <button
                          id="notifications-refresh"
                          type="button"
                          onClick={() =>
                            void capturedNotificationsQuery.refetch()
                          }
                          className="panel-btn panel-btn--ghost rounded-[8px] px-3 py-2 text-[12px]"
                        >
                          <RefreshCcw
                            size={11}
                            className={
                              capturedNotificationsQuery.isFetching
                                ? "animate-spin"
                                : ""
                            }
                          />
                          {t("common.refresh")}
                        </button>
                      </div>

                      {capturedNotificationsQuery.isLoading ? (
                        <div className="panel-loading min-h-[80px]">
                          <LoaderCircle size={16} className="animate-spin" />
                        </div>
                      ) : !capturedNotifications.length ? (
                        <div className="panel-empty flex-1 min-h-[150px] text-[12px]">
                          <BadgeCheck size={26} />
                          <span>{t("settings.listener.noNotifications")}</span>
                        </div>
                      ) : (
                        <div className="flex max-h-[340px] min-h-[150px] flex-1 flex-col gap-2 overflow-y-auto pr-1">
                          {capturedNotifications.slice(0, 10).map((notif) => (
                            <div
                              key={notif.id}
                              className="panel-muted-block rounded-[12px] px-3.5 py-3"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[12px] font-semibold text-[var(--win-text)]">
                                  {notif.appName || notif.packageName}
                                </span>
                                <span className="panel-mono text-[12px] text-[var(--text-secondary)]">
                                  {new Date(
                                    notif.receivedAt || notif.createdAt,
                                  ).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-[12px] text-[var(--win-text)] font-medium">
                                {notif.title}
                              </div>
                              <div className="text-[12px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                                {notif.body}
                              </div>
                              {notif.amountDetected ? (
                                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--panel-success-text)]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[var(--panel-success-text)]">
                                  <BadgeCheck size={10} />
                                  Rp{" "}
                                  {Number(notif.amountDetected).toLocaleString(
                                    "id-ID",
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 panel-muted-block rounded-[14px] px-4 py-3 text-[12px] leading-5 text-[var(--text-secondary)]">
                    <strong className="text-[var(--win-text)]">
                      {t("settings.listener.howItWorksTitle")}
                    </strong>{" "}
                    {t("settings.listener.howItWorksStart")}{" "}
                    <code className="panel-mono text-[12px] text-[var(--win-text)]">
                      NotificationListener
                    </code>{" "}
                    {t("settings.listener.howItWorksEnd")}
                  </div>
                </div>
              )}

              {/* ── 6. Audit Trail ── */}
              {activeTab === "audit" && (
                <div className="panel-shell-card p-5">
                  <div className="mb-3.5 flex items-center justify-between gap-3">
                    <SectionHeader
                      icon={<Clock size={17} />}
                      title={t("settings.auditTrail")}
                      subtitle={t("settings.auditTrailSubtitle")}
                    />
                    <div className="panel-badge panel-badge--info">
                      {t("settings.entriesCount", {
                        count: settingsAudit.length,
                      })}
                    </div>
                  </div>

                  {settingsAudit.length ? (
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                      {settingsAudit.map((entry) => (
                        <AuditCard
                          key={entry.id}
                          username={entry.username}
                          createdAt={entry.createdAt}
                          hostname={entry.hostname}
                          timezone={entry.timezone}
                          nameservers={entry.nameservers ?? []}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="panel-empty min-h-[120px] text-[12px]">
                      <span>{t("settings.noAuditEntries")}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

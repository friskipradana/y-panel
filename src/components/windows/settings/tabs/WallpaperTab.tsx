import { useRef, type CSSProperties } from "react";
import { CircleCheck, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { WALLPAPERS, useThemeStore, type WallpaperKey } from "@/store/themeStore";
import { updateWallpaper } from "@/api/system";
import { Button } from "@/components/ui/Button";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OptionCards } from "../OptionCards";
import { SettingsGroup } from "../SettingsPrimitives";

type PresetKey = Exclude<WallpaperKey, "custom">;

const PHOTOS: PresetKey[] = [
  "server-datacenter",
  "tokyo-night",
  "dark-mountains",
  "deep-nebula",
  "nordic-forest",
  "desert-dusk",
  "minimal-architecture",
  "abstract-wave",
];
const GRADIENTS: PresetKey[] = [
  "default",
  "ocean",
  "sunset",
  "forest",
  "midnight",
  "aurora",
];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// One wallpaper to pick: its picture/gradient, its name, and an indicator when active
function WallpaperTile({
  label,
  style,
  selected,
  onClick,
  loading,
}: {
  label: string;
  style: CSSProperties;
  selected: boolean;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-xl text-left border-2 transition-all cursor-pointer"
    >
      <span
        className="block aspect-[16/10] w-full bg-cover bg-center transition-transform duration-200 group-hover:scale-105"
        style={style}
        aria-hidden="true"
      />
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_srgb,var(--win-content-bg)_60%,transparent)] backdrop-blur-xs">
          <Loader2 size={16} className="animate-spin text-[var(--panel-primary-solid)]" />
        </div>
      ) : null}
      <span
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-t border-[var(--win-border)] transition-colors ${
          selected ? "bg-[var(--panel-primary-bg)] font-semibold" : "bg-[var(--panel-surface)]"
        }`}
      >
        <span className="truncate text-[11px] text-[var(--win-text)]">{label}</span>
        {selected ? (
          <CircleCheck size={13} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" />
        ) : null}
      </span>
    </SelectableCard>
  );
}

export function WallpaperTab() {
  const { t } = useI18n();
  const {
    mode,
    wallpaper,
    setWallpaper,
    wallpaperFit,
    setWallpaperFit,
    customImageUrl,
    setCustomImage,
    wallpaperLoading,
  } = useThemeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.appearance.wallpaperNotImage"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        t("settings.appearance.wallpaperTooBig", {
          size: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
        })
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === "string" && dataUrl) void setCustomImage(dataUrl);
    };
    reader.onerror = () => toast.error(t("settings.appearance.wallpaperReadFailed"));
    reader.readAsDataURL(file);
  };

  const removeCustom = async () => {
    useThemeStore.setState({ customImageUrl: null, wallpaper: "dark-mountains" });
    try {
      await updateWallpaper("");
      toast.success(t("settings.appearance.resetSuccessTitle"));
    } catch {
      // ignore
    }
  };

  const showFit = wallpaper === "custom" || WALLPAPERS[wallpaper as PresetKey]?.type === "image";

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={upload}
        className="hidden"
        aria-label={t("settings.appearance.uploadWallpaper")}
      />

      {/* ── 1. HD Wallpapers & Custom Background Group ── */}
      <SettingsGroup
        title={t("settings.appearance.wallpaperTitle")}
        description={t("settings.appearance.wallpaperSubtitle")}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-[var(--win-text)]">
              {t("settings.appearance.hdWallpapers")}
            </span>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 !h-8 text-[11.5px]"
              icon={<Upload className="h-3.5 w-3.5" />}
              loading={wallpaperLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("settings.appearance.uploadWallpaper")}
            </Button>
          </div>

          {/* Custom Wallpaper (if uploaded) */}
          {customImageUrl ? (
            <div className="p-2.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-hover)]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11.5px] font-semibold text-[var(--win-text)]">
                  {t("settings.appearance.customWallpaper")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="!h-6 px-2 text-[11px] text-[var(--panel-danger-text)] hover:bg-[var(--panel-danger-bg)]"
                  icon={<Trash2 className="h-3 w-3" />}
                  onClick={() => void removeCustom()}
                >
                  {t("common.delete")}
                </Button>
              </div>
              <div className="max-w-[220px]">
                <WallpaperTile
                  label={t("settings.appearance.customWallpaper")}
                  selected={wallpaper === "custom"}
                  loading={wallpaper === "custom" && wallpaperLoading}
                  onClick={() => setWallpaper("custom")}
                  style={{ backgroundImage: `url("${customImageUrl}")` }}
                />
              </div>
            </div>
          ) : null}

          {/* Grid of Curated Presets */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {PHOTOS.map((key) => {
              const def = WALLPAPERS[key];
              if (!def) return null;
              return (
                <WallpaperTile
                  key={key}
                  label={def.label}
                  selected={wallpaper === key}
                  onClick={() => setWallpaper(key)}
                  style={{ backgroundImage: `url("${def.previewUrl || def.light}")` }}
                />
              );
            })}
          </div>
        </div>
      </SettingsGroup>

      {/* ── 2. Gradient Wallpapers Group ── */}
      <SettingsGroup
        title={t("settings.appearance.gradientWallpapers")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {GRADIENTS.map((key) => {
            const def = WALLPAPERS[key];
            if (!def) return null;
            return (
              <WallpaperTile
                key={key}
                label={def.label}
                selected={wallpaper === key}
                onClick={() => setWallpaper(key)}
                style={{ background: mode === "dark" ? (def.dark ?? def.light) : def.light }}
              />
            );
          })}
        </div>
      </SettingsGroup>

      {/* ── 3. Fit Mode Group ── */}
      {showFit ? (
        <SettingsGroup
          title={t("settings.appearance.displayMode")}
          description={t("settings.appearance.displayModeSubtitle")}
        >
          <OptionCards
            label={t("settings.appearance.displayMode")}
            value={wallpaperFit}
            onChange={setWallpaperFit}
            options={[
              { key: "cover", label: t("settings.appearance.fitCover") },
              { key: "contain", label: t("settings.appearance.fitContain") },
              { key: "stretch", label: t("settings.appearance.fitStretch") },
              { key: "center", label: t("settings.appearance.fitCenter") },
              { key: "tile", label: t("settings.appearance.fitTile") },
            ]}
          />
        </SettingsGroup>
      ) : null}
    </div>
  );
}

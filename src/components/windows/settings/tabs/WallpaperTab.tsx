import { useRef } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { WALLPAPERS, useThemeStore, type WallpaperKey, type WallpaperFit } from "@/store/themeStore";
import { updateWallpaper } from "@/api/system";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AdwActionRow, SettingsGroup } from "../SettingsPrimitives";

type PresetKey = Exclude<WallpaperKey, "custom">;

const ALL_PRESETS: PresetKey[] = [
  "server-datacenter",
  "tokyo-night",
  "dark-mountains",
  "deep-nebula",
  "nordic-forest",
  "desert-dusk",
  "minimal-architecture",
  "abstract-wave",
  "default",
  "ocean",
  "sunset",
  "forest",
  "midnight",
  "aurora",
];

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
    <div className="space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={upload}
        className="hidden"
        aria-label={t("settings.appearance.uploadWallpaper")}
      />

      {/* ── 1. Wallpapers (3-Column Clean GNOME Thumbnail Grid) ── */}
      <SettingsGroup
        title={t("settings.appearance.wallpaperTitle")}
        action={
          <Button
            type="button"
            variant="default"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => fileInputRef.current?.click()}
            className="!h-7 px-2.5 text-[12px]"
          >
            {t("settings.appearance.addPicture")}
          </Button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Custom Uploaded Picture (if any) */}
          {customImageUrl ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setWallpaper("custom")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setWallpaper("custom");
              }}
              style={{ backgroundImage: `url("${customImageUrl}")` }}
              className={`adw-wallpaper-tile group ${wallpaper === "custom" ? "adw-wallpaper-tile--active" : ""}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeCustom();
                }}
                title={t("common.delete")}
                className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={12} />
              </button>
              {wallpaper === "custom" ? (
                <div className="adw-wallpaper-tile__badge">
                  <Check size={12} strokeWidth={3} />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* All Curated Presets */}
          {ALL_PRESETS.map((key) => {
            const def = WALLPAPERS[key];
            if (!def) return null;
            const isSelected = wallpaper === key;
            const bgStyle =
              def.type === "image"
                ? { backgroundImage: `url("${def.previewUrl || def.light}")` }
                : { background: mode === "dark" ? (def.dark ?? def.light) : def.light };

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setWallpaper(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setWallpaper(key);
                }}
                style={bgStyle}
                className={`adw-wallpaper-tile ${isSelected ? "adw-wallpaper-tile--active" : ""}`}
                title={def.label}
              >
                {isSelected ? (
                  <div className="adw-wallpaper-tile__badge">
                    <Check size={12} strokeWidth={3} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SettingsGroup>

      {/* ── 2. Display Fit Mode (Clean GNOME Row) ── */}
      {showFit ? (
        <SettingsGroup title={t("settings.appearance.displayMode")} cardClassName="!p-0">
          <AdwActionRow
            title={t("settings.appearance.displayMode")}
            subtitle={t("settings.appearance.displayModeSubtitle")}
            control={
              <div className="w-[180px]">
                <Select
                  id="settings-wallpaper-fit-select"
                  value={wallpaperFit}
                  onChange={(val) => setWallpaperFit(val as WallpaperFit)}
                  buttonClassName="!h-8 text-[12px] px-2.5"
                  options={[
                    { value: "cover", label: t("settings.appearance.fitCover") },
                    { value: "contain", label: t("settings.appearance.fitContain") },
                    { value: "stretch", label: t("settings.appearance.fitStretch") },
                    { value: "center", label: t("settings.appearance.fitCenter") },
                    { value: "tile", label: t("settings.appearance.fitTile") },
                  ]}
                />
              </div>
            }
          />
        </SettingsGroup>
      ) : null}
    </div>
  );
}

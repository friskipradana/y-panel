import { useRef } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { WALLPAPERS, useThemeStore, type WallpaperKey } from "@/store/themeStore";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button"

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

  return (
    <div className="space-y-3.5">

      {/* Wallpaper Gallery Card */}
      <div className="panel-shell-card p-4.5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            icon={<ImagePlus />}
            title={t("settings.appearance.wallpaperTitle")}
            subtitle={t("settings.appearance.wallpaperSubtitle")}
          />
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleCustomWallpaperUpload}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()} variant="primary" className="rounded-xl px-3.5 py-2 text-[12.5px] flex items-center gap-2"
          >
            <Upload size={14} />
            {t("settings.appearance.uploadWallpaper")}
          </Button>
        </div>

        {/* HD Image Wallpapers (Unsplash Pack) */}
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
            {t("settings.appearance.hdWallpapers")}
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
                  className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all cursor-pointer text-left ${
                    isActive
                      ? "border-[var(--panel-primary-solid)] ring-2 ring-[var(--panel-primary-solid)]/40 shadow-md"
                      : "border-[var(--win-border)] hover:border-[var(--panel-primary-solid)]/50"
                  }`}
                >
                  <div
                    className="h-18 w-full bg-cover bg-center transition-transform duration-200 group-hover:scale-105"
                    style={{
                      backgroundImage: `url("${def.previewUrl || def.light}")`,
                    }}
                  />
                  <div className="p-2 flex items-center justify-between bg-[var(--panel-surface)]">
                    <span className="text-[11px] font-semibold text-[var(--win-text)] truncate">
                      {def.label}
                    </span>
                    {isActive && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" />
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
            {t("settings.appearance.gradientWallpapers")}
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
                    {t("settings.appearance.customWallpaper")}
                  </span>
                  {wallpaper === "custom" && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" />
                  )}
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Wallpaper Fit Mode Selector */}
        {(wallpaper === "custom" || (WALLPAPERS[wallpaper as Exclude<WallpaperKey, "custom">]?.type === "image")) && (
          <div className="pt-3 border-t border-[var(--win-border)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-[var(--win-text)]">
                {t("settings.appearance.displayMode")}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                {t("settings.appearance.displayModeSubtitle")}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-w-[560px]">
              {[
                { key: "cover" as const, label: t("settings.appearance.fitCover") },
                { key: "contain" as const, label: t("settings.appearance.fitContain") },
                { key: "stretch" as const, label: t("settings.appearance.fitStretch") },
                { key: "center" as const, label: t("settings.appearance.fitCenter") },
                { key: "tile" as const, label: t("settings.appearance.fitTile") },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setWallpaperFit(item.key)}
                  className={`py-1.5 px-2.5 rounded-xl border text-[11.5px] font-medium transition-all cursor-pointer text-center ${
                    wallpaperFit === item.key
                      ? "border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-bold shadow-sm"
                      : "border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] hover:bg-[var(--panel-surface-hover)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

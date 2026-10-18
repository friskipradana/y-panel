import { useRef, type CSSProperties } from "react";
import { CircleCheck, ImagePlus, Sliders, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { WALLPAPERS, useThemeStore, type WallpaperKey } from "@/store/themeStore";
import { updateWallpaper } from "@/api/system";
import { Button } from "@/components/ui/Button";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OptionCards } from "../OptionCards";

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
}: {
  label: string;
  style: CSSProperties;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg text-left"
    >
      <span
        className="block h-[58px] w-full bg-cover bg-center transition-transform duration-200 group-hover:scale-105"
        style={style}
        aria-hidden="true"
      />
      <span
        className={`flex items-center justify-between gap-1.5 px-2 py-1.5 border-t border-[var(--win-border)] transition-colors ${
          selected ? "bg-[var(--panel-primary-bg)]" : "bg-[var(--panel-surface)]"
        }`}
      >
        <span className="truncate text-[11px] font-semibold text-[var(--win-text)]">{label}</span>
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
    <div className="space-y-3">
      {/* ── Single Unified Wallpaper Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={upload}
          className="hidden"
          aria-label={t("settings.appearance.uploadWallpaper")}
        />

        {/* ── Section Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ImagePlus className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">
                {t("settings.appearance.wallpaperTitle")}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                {t("settings.appearance.wallpaperSubtitle")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="shrink-0 !h-8 text-[12px]"
            icon={<Upload className="h-3.5 w-3.5" />}
            loading={wallpaperLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("settings.appearance.uploadWallpaper")}
          </Button>
        </div>

        {/* ── Custom Wallpaper (if uploaded) ── */}
        {customImageUrl ? (
          <>
            <div className="border-t border-[var(--win-border)]" />
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11.5px] font-medium text-[var(--win-text)]">
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
              <div className="max-w-[200px]">
                <WallpaperTile
                  label={t("settings.appearance.customWallpaper")}
                  selected={wallpaper === "custom"}
                  onClick={() => setWallpaper("custom")}
                  style={{ backgroundImage: `url("${customImageUrl}")` }}
                />
              </div>
            </div>
          </>
        ) : null}

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 1: Wallpaper Gambar HD ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11.5px] font-medium text-[var(--win-text)]">
              {t("settings.appearance.hdWallpapers")}
            </span>
            <span className="text-[10.5px] text-[var(--text-secondary)]">{PHOTOS.length} Preset HD</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* ── Section 2: Gradien Minimalis ── */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11.5px] font-medium text-[var(--win-text)]">
              {t("settings.appearance.gradientWallpapers")}
            </span>
            <span className="text-[10.5px] text-[var(--text-secondary)]">{GRADIENTS.length} Gradien</span>
          </div>
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
        </div>

        {/* ── Section 3: Mode Tampilan Wallpaper (Fit Mode) ── */}
        {showFit ? (
          <>
            <div className="border-t border-[var(--win-border)]" />
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
                  <h2 className="text-[13px] font-semibold text-[var(--win-text)]">
                    {t("settings.appearance.displayMode")}
                  </h2>
                </div>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {t("settings.appearance.displayModeSubtitle")}
                </span>
              </div>
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
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

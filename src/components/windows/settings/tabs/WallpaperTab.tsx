import { useRef, type CSSProperties } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { WALLPAPERS, useThemeStore, type WallpaperKey } from "@/store/themeStore";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OptionCards } from "../OptionCards";

type PresetKey = Exclude<WallpaperKey, "custom">;

const PHOTOS: PresetKey[] = ["server-datacenter", "tokyo-night", "dark-mountains", "deep-nebula", "nordic-forest", "desert-dusk", "minimal-architecture", "abstract-wave"];
const GRADIENTS: PresetKey[] = ["default", "ocean", "sunset", "forest", "midnight", "aurora"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// One wallpaper to pick: its picture, its name, and a check when it is the one in use
function WallpaperTile({ label, style, selected, onClick }: { label: string; style: CSSProperties; selected: boolean; onClick: () => void }) {
  return (
    <SelectableCard selected={selected} onClick={onClick} className="flex flex-col overflow-hidden rounded-xl text-left">
      <span className="block h-[72px] w-full bg-cover bg-center" style={style} aria-hidden="true" />
      <span className="flex items-center justify-between gap-2 bg-[var(--panel-surface)] px-2.5 py-2">
        <span className="truncate text-[11px] font-semibold text-[var(--win-text)]">{label}</span>
        {selected ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--panel-primary-solid)]" aria-hidden="true" /> : null}
      </span>
    </SelectableCard>
  );
}

export function WallpaperTab() {
  const { t } = useI18n();
  const { mode, wallpaper, setWallpaper, wallpaperFit, setWallpaperFit, customImageUrl, setCustomImage, wallpaperLoading } = useThemeStore();
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
      toast.error(t("settings.appearance.wallpaperTooBig", { size: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) }));
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

  const showFit = wallpaper === "custom" || WALLPAPERS[wallpaper as PresetKey]?.type === "image";

  return (
    <div className="space-y-3.5">
      <section className="panel-shell-card settings-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader icon={<ImagePlus />} title={t("settings.appearance.wallpaperTitle")} subtitle={t("settings.appearance.wallpaperSubtitle")} />
          <input type="file" ref={fileInputRef} accept="image/*" onChange={upload} className="hidden" aria-label={t("settings.appearance.uploadWallpaper")} />
          <Button type="button" variant="primary" icon={<Upload className="h-3.5 w-3.5" />} loading={wallpaperLoading} onClick={() => fileInputRef.current?.click()}>
            {t("settings.appearance.uploadWallpaper")}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="panel-section-label">{t("settings.appearance.hdWallpapers")}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {PHOTOS.map((key) => {
              const def = WALLPAPERS[key];
              if (!def) return null;
              return <WallpaperTile key={key} label={def.label} selected={wallpaper === key} onClick={() => setWallpaper(key)} style={{ backgroundImage: `url("${def.previewUrl || def.light}")` }} />;
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="panel-section-label">{t("settings.appearance.gradientWallpapers")}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {GRADIENTS.map((key) => {
              const def = WALLPAPERS[key];
              if (!def) return null;
              return <WallpaperTile key={key} label={def.label} selected={wallpaper === key} onClick={() => setWallpaper(key)} style={{ background: mode === "dark" ? (def.dark ?? def.light) : def.light }} />;
            })}
            {customImageUrl ? <WallpaperTile label={t("settings.appearance.customWallpaper")} selected={wallpaper === "custom"} onClick={() => setWallpaper("custom")} style={{ backgroundImage: `url("${customImageUrl}")` }} /> : null}
          </div>
        </div>

        {showFit ? (
          <div className="space-y-2 border-t border-[var(--win-border)] pt-3.5">
            <div>
              <p className="panel-section-label">{t("settings.appearance.displayMode")}</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{t("settings.appearance.displayModeSubtitle")}</p>
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
        ) : null}
      </section>
    </div>
  );
}

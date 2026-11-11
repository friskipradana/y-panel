import { useRef } from "react";
import { Check, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { alertLib } from "@/lib/alert";
import { useI18n, type Language } from "@/lib/i18n";
import { WALLPAPERS, useThemeStore, type WallpaperKey } from "@/store/themeStore";
import { updateWallpaper } from "@/api/system";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AdwActionRow, SettingsGroup } from "../SettingsPrimitives";

const FONTS = [
  { key: "outfit", name: "Outfit", css: "'Outfit', system-ui, sans-serif" },
  { key: "inter", name: "Inter", css: "'Inter', system-ui, sans-serif" },
  { key: "plus-jakarta-sans", name: "Plus Jakarta Sans", css: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { key: "geist", name: "Geist", css: "'Geist', system-ui, sans-serif" },
  { key: "roboto", name: "Roboto", css: "'Roboto', system-ui, sans-serif" },
] as const;

type PresetKey = Exclude<WallpaperKey, "custom">;

const FEATURED_WALLPAPERS: PresetKey[] = [
  "server-datacenter",
  "tokyo-night",
  "dark-mountains",
  "deep-nebula",
  "nordic-forest",
  "desert-dusk",
  "abstract-wave",
  "ocean",
  "sunset",
];

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function AppearanceTab() {
  const { t, language, setLanguage } = useI18n();
  const {
    mode,
    setMode,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    wallpaper,
    setWallpaper,
    customImageUrl,
    setCustomImage,
    resetToDefaults,
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

  const reset = async () => {
    const confirmed = await alertLib.confirm(
      t("settings.appearance.resetConfirmTitle"),
      t("settings.appearance.resetConfirmMessage"),
      t("settings.appearance.resetConfirmAction"),
      t("common.cancel"),
      "warning",
      "settings"
    );
    if (confirmed) {
      resetToDefaults();
      alertLib.fire(
        t("settings.appearance.resetSuccessTitle"),
        t("settings.appearance.resetSuccessMessage"),
        "success",
        "settings"
      );
    }
  };

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

      {/* ── 1. Style Group (Authentic Dual Overlapping Windows Mockup) ── */}
      <SettingsGroup title={t("settings.appearance.style")}>
        <div className="grid grid-cols-2 gap-4 sm:gap-8 justify-items-center py-1 sm:py-2">
          {/* Default (Light) Style Preview */}
          <button
            type="button"
            onClick={() => setMode("light")}
            aria-label={t("settings.appearance.default")}
            className={`adw-style-card ${mode === "light" ? "adw-style-card--active" : ""}`}
          >
            <div className="adw-style-card__preview">
              <div className="adw-mockup adw-mockup--light">
                <div className="adw-mockup__back-win">
                  <div className="adw-mockup__bar" />
                </div>
                <div className="adw-mockup__front-win">
                  <div className="adw-mockup__bar" />
                </div>
              </div>
            </div>
            <span className="adw-style-card__label">
              {t("settings.appearance.default")}
            </span>
          </button>

          {/* Dark Style Preview */}
          <button
            type="button"
            onClick={() => setMode("dark")}
            aria-label={t("settings.appearance.dark")}
            className={`adw-style-card ${mode === "dark" ? "adw-style-card--active" : ""}`}
          >
            <div className="adw-style-card__preview">
              <div className="adw-mockup adw-mockup--dark">
                <div className="adw-mockup__back-win">
                  <div className="adw-mockup__bar" />
                </div>
                <div className="adw-mockup__front-win">
                  <div className="adw-mockup__bar" />
                </div>
              </div>
            </div>
            <span className="adw-style-card__label">
              {t("settings.appearance.dark")}
            </span>
          </button>
        </div>
      </SettingsGroup>

      {/* ── 2. Background Group (3-Column Clean Thumbnail Grid) ── */}
      <SettingsGroup
        title={t("settings.appearance.background")}
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

          {/* Curated Preset Wallpapers */}
          {FEATURED_WALLPAPERS.map((key) => {
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

      {/* ── 3. Preferences Group (Flat GNOME Action Rows) ── */}
      <SettingsGroup title={t("settings.appearance.preferences")} cardClassName="!p-0">
        <AdwActionRow
          title={t("settings.language.title")}
          subtitle={t("settings.language.subtitle")}
          control={
            <div className="w-[180px]">
              <Select
                id="settings-language-select"
                value={language}
                onChange={(value) => setLanguage(value as Language)}
                buttonClassName="!h-8 text-[12px] px-2.5"
                options={[
                  { value: "id", label: t("language.indonesian") },
                  { value: "en", label: t("language.english") },
                ]}
              />
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.fonts.family")}
          subtitle={t("settings.fonts.subtitle")}
          control={
            <div className="w-[200px]">
              <Select
                id="settings-font-family-select"
                value={fontFamily}
                onChange={(val) => setFontFamily(val as typeof fontFamily)}
                buttonClassName="!h-8 text-[12px] px-2.5"
                options={FONTS.map((font) => ({
                  value: font.key,
                  label: font.name,
                }))}
              />
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.fonts.size")}
          subtitle={t("settings.fonts.subtitle")}
          control={
            <div
              role="group"
              aria-label={t("settings.fonts.size")}
              className="inline-flex rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-0.5"
            >
              {[
                { key: "small" as const, label: t("settings.fonts.sizeSmall") },
                { key: "medium" as const, label: t("settings.fonts.sizeMedium") },
                { key: "large" as const, label: t("settings.fonts.sizeLarge") },
              ].map((opt) => {
                const selected = fontSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFontSize(opt.key)}
                    className={`px-3 py-1 text-[11.5px] font-medium rounded-md transition-all cursor-pointer ${
                      selected
                        ? "bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] font-semibold shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--win-text)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          }
        />

        <AdwActionRow
          title={t("settings.appearance.resetTitle")}
          subtitle={t("settings.appearance.resetSubtitle")}
          control={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-[11.5px] !h-8"
              icon={<RefreshCcw className="h-3.5 w-3.5" />}
              onClick={() => void reset()}
            >
              {t("settings.appearance.resetBtn")}
            </Button>
          }
        />
      </SettingsGroup>
    </div>
  );
}

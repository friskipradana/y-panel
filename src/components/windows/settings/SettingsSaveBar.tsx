import type { ReactNode } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SettingsSaveBarProps {
  id?: string;
  title: string;
  /** What is waiting to be saved, or that nothing is */
  hint: string;
  dirty: boolean;
  pending: boolean;
  /** Something in the form is not valid yet */
  invalid?: boolean;
  onSave: () => void;
  saveLabel: string;
  pendingLabel: string;
  /** Another action next to Save (a connection test) */
  extra?: ReactNode;
}

// The save row of a page that edits settings: it appears when something is unsaved (or there is another action to keep), stays in view while the page scrolls, and says what is unsaved
export function SettingsSaveBar({ id, title, hint, dirty, pending, invalid = false, onSave, saveLabel, pendingLabel, extra }: SettingsSaveBarProps) {
  // nothing to save and nothing else to offer: the bar would only cover the page
  if (!dirty && !pending && !extra) return null;

  return (
    <div className={`settings-savebar${dirty ? " settings-savebar--dirty" : ""}`}>
      <div className="min-w-0">
        <p className="settings-savebar__title text-[13px] font-semibold text-[var(--win-text)]">{title}</p>
        <p className="settings-savebar__hint mt-0.5 text-[11.5px] text-[var(--text-secondary)]" aria-live="polite">{hint}</p>
      </div>
      <div className="settings-savebar__actions flex shrink-0 items-center gap-2">
        {extra}
        <Button id={id} type="button" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={pending} disabled={!dirty || invalid} onClick={onSave}>
          {pending ? pendingLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}

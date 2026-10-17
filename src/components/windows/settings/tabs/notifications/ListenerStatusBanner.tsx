import { Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { NotificationSettings } from "../../hooks/useNotificationSettings";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";

// Whether the live connection to the phones is up
export function ListenerStatusBanner({ listener }: { listener: NotificationSettings }) {
  const { t } = useI18n();
  const { capturedWS } = listener;

  return (
    <section className="panel-shell-card settings-card">
      <SectionHeader
        icon={<Smartphone />}
        title={t("settings.listener.title")}
        subtitle={t("settings.listener.subtitle")}
        actions={
          <Badge tone={capturedWS.connected ? "success" : "warning"} dot>
            {capturedWS.connected ? t("settings.listener.realtimeConnected") : t("settings.listener.realtimeReconnecting")}
          </Badge>
        }
      />
    </section>
  );
}

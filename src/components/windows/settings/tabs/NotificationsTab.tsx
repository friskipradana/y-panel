import { useState } from "react";
import { Plug, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Tabs } from "@/components/ui/Tabs";
import type { NotificationSettings } from "../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../constants";
import { ListenerStatusBanner } from "./notifications/ListenerStatusBanner";
import { IntegrationEndpointsCard } from "./notifications/IntegrationEndpointsCard";
import { ListenerKeyFormCard } from "./notifications/ListenerKeyFormCard";
import { RegisteredDevicesCard } from "./notifications/RegisteredDevicesCard";
import { LiveNotificationsFeedCard } from "./notifications/LiveNotificationsFeedCard";
import { SchemaReferenceCard } from "./notifications/SchemaReferenceCard";
import { AndroidPermissionNote } from "./notifications/AndroidPermissionNote";

type Section = "devices" | "integration";

// Notifications: what is happening now (devices and the live feed) apart from how to connect a sender
export function NotificationsTab({ listener, setActiveTab }: { listener: NotificationSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("devices");

  return (
    <div className="space-y-3.5">
      <ListenerStatusBanner listener={listener} />

      <div className="overflow-x-auto">
        <Tabs
          label={t("settings.notifications.sections")}
          value={section}
          onChange={setSection}
          items={[
            { key: "devices", label: t("settings.notifications.sectionDevices"), icon: <Smartphone /> },
            { key: "integration", label: t("settings.notifications.sectionIntegration"), icon: <Plug /> },
          ]}
        />
      </div>

      {section === "devices" ? (
        <>
          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2 items-stretch">
            <RegisteredDevicesCard listener={listener} />
            <LiveNotificationsFeedCard listener={listener} />
          </div>
          <AndroidPermissionNote />
        </>
      ) : (
        <>
          <IntegrationEndpointsCard listener={listener} />
          <ListenerKeyFormCard listener={listener} setActiveTab={setActiveTab} />
          <SchemaReferenceCard />
        </>
      )}
    </div>
  );
}

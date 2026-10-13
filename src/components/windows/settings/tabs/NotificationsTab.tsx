import type { NotificationSettings } from "../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../constants";
import { ListenerStatusBanner } from "./notifications/ListenerStatusBanner";
import { IntegrationEndpointsCard } from "./notifications/IntegrationEndpointsCard";
import { ListenerKeyFormCard } from "./notifications/ListenerKeyFormCard";
import { RegisteredDevicesCard } from "./notifications/RegisteredDevicesCard";
import { LiveNotificationsFeedCard } from "./notifications/LiveNotificationsFeedCard";
import { SchemaReferenceCard } from "./notifications/SchemaReferenceCard";
import { AndroidPermissionNote } from "./notifications/AndroidPermissionNote";

export function NotificationsTab({ listener, setActiveTab }: { listener: NotificationSettings; setActiveTab: (tab: SettingsTabKey) => void }) {
  return (
    <div className="space-y-3.5">
      <ListenerStatusBanner listener={listener} />
      <IntegrationEndpointsCard listener={listener} />
      <ListenerKeyFormCard listener={listener} setActiveTab={setActiveTab} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-stretch">
        <RegisteredDevicesCard listener={listener} />
        <LiveNotificationsFeedCard listener={listener} />
      </div>
      <SchemaReferenceCard />
      <AndroidPermissionNote />
    </div>
  );
}

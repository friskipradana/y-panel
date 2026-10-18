import { useState } from "react";
import { CreditCard, Plug, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Tabs } from "@/components/ui/Tabs";
import type { PaymentSettings } from "../hooks/usePaymentSettings";
import type { NotificationSettings } from "../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../constants";
import { GatewaySection } from "./payment/GatewaySection";
import { ListenerConnect } from "./payment/ListenerConnect";
import { ListenerDevices } from "./payment/ListenerDevices";

type Section = "devices" | "connect" | "gateway";

// Payments: the phone that reads the bank notifications (how a transfer is noticed), and the payment gateways.
// An admin sees the reader only; the gateways stay with the superadmin.
export function PaymentTab({
  payment,
  listener,
  setActiveTab,
  canManageGateways,
}: {
  payment: PaymentSettings;
  listener: NotificationSettings;
  setActiveTab: (tab: SettingsTabKey) => void;
  canManageGateways: boolean;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("devices");

  const items = [
    { key: "devices" as const, label: t("settings.notifications.sectionDevices"), icon: <Smartphone size={13} /> },
    { key: "connect" as const, label: t("settings.notifications.sectionIntegration"), icon: <Plug size={13} /> },
    ...(canManageGateways ? [{ key: "gateway" as const, label: t("settings.payment.sectionGateway"), icon: <CreditCard size={13} /> }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Tabs label={t("settings.payment.sections")} value={section} onChange={setSection} items={items} />
      </div>
      {section === "devices" ? <ListenerDevices listener={listener} /> : null}
      {section === "connect" ? <ListenerConnect listener={listener} setActiveTab={setActiveTab} /> : null}
      {section === "gateway" && canManageGateways ? <GatewaySection payment={payment} /> : null}
    </div>
  );
}

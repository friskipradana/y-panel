import { useState } from "react";
import { ArrowLeft, ArrowRight, CreditCard, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import { Tabs } from "@/components/ui/Tabs";
import type { PaymentSettings } from "../hooks/usePaymentSettings";
import type { NotificationSettings } from "../hooks/useNotificationSettings";
import type { SettingsTabKey } from "../constants";
import { GatewaySection } from "./payment/GatewaySection";
import { ListenerEndpoints } from "./payment/ListenerConnect";
import { ListenerDeviceList } from "./payment/ListenerDeviceList";
import { ListenerDevices } from "./payment/ListenerDevices";

type Section = "bank" | "gateway";
type Step = 1 | 2 | 3;

// Payments. A transfer is noticed by the phone that reads the bank notifications, set up in three steps (the addresses, the
// key of the device, then watching what arrives); the payment gateways of Midtrans and Xendit are the other tab, for the
// superadmin. An admin sees the bank notifications only.
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
  const [section, setSection] = useState<Section>("bank");
  // with a phone already connected the page opens on what it sends; with none, on how to connect one
  const [step, setStep] = useState<Step>(listener.notificationDevices.length > 0 ? 3 : 1);

  const tabs = [
    { key: "bank" as const, label: t("settings.payment.sectionBank"), icon: <Smartphone size={13} /> },
    ...(canManageGateways ? [{ key: "gateway" as const, label: t("settings.payment.sectionGateway"), icon: <CreditCard size={13} /> }] : []),
  ];
  const steps: { key: Step; label: string }[] = [
    { key: 1, label: t("settings.payment.stepAddresses") },
    { key: 2, label: t("settings.payment.stepDevice") },
    { key: 3, label: t("settings.payment.stepWatch") },
  ];

  return (
    <div className="space-y-3">
      {tabs.length > 1 ? (
        <div className="overflow-x-auto">
          <Tabs label={t("settings.payment.sections")} value={section} onChange={setSection} items={tabs} />
        </div>
      ) : null}

      {section === "bank" ? (
        <div className="panel-shell-card settings-card !p-3.5 flex flex-col gap-3.5">
          <Stepper label={t("settings.payment.steps")} items={steps} value={step} onChange={setStep} />

          <div className="border-t border-[var(--win-border)] pt-3.5">
            {step === 1 ? <ListenerEndpoints listener={listener} /> : null}
            {step === 2 ? <ListenerDeviceList listener={listener} setActiveTab={setActiveTab} /> : null}
            {step === 3 ? <ListenerDevices bare listener={listener} /> : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--win-border)] pt-3.5">
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} disabled={step === 1} onClick={() => setStep((step - 1) as Step)}>
              {t("common.previous")}
            </Button>
            {step < 3 ? (
              <Button variant="primary" size="sm" onClick={() => setStep((step + 1) as Step)}>
                {t("common.next")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {section === "gateway" && canManageGateways ? <GatewaySection payment={payment} /> : null}
    </div>
  );
}

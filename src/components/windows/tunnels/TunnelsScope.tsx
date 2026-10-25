import { useState } from "react";
import { Copy, Info, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { alertLib } from "@/lib/alert";
import { Select } from "@/components/ui/Select";
import { STATUS_CONFIG } from "./tunnelForms";
import { DomainInfoModal, ProfileInfoModal } from "./TunnelModals";
import { useIsMobileLayout } from "@/hooks/useIsMobileLayout";
import type { TunnelsWindowState } from "./useTunnelsWindow";

const SEARCH_FROM = 8;

// What the list below belongs to: the domain whose DNS records it shows, or the tunnel profile whose routes
export function TunnelsScope({ tw }: { tw: TunnelsWindowState }) {
  const isMobile = useIsMobileLayout();
  const [showDomainInfo, setShowDomainInfo] = useState(false);
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const {
    t,
    tab,
    safeDomains,
    safeProfiles,
    selectedDomain,
    selectedDomainId,
    setSelectedDomainId,
    selectedProfile,
    selectedProfileId,
    setSelectedProfileId,
    checkCreatedDomainMut,
    deleteDomainMut,
    deleteProfileMut,
  } = tw;

  if (tab === "domains") {
    if (safeDomains.length === 0) return null;
    const askDeleteDomain = async () => {
      if (!selectedDomain) return;
      const confirmed = await alertLib.confirm(
        t("tunnels.deleteDomainQuestion"),
        t("tunnels.deleteDomainMessage", { name: selectedDomain.name }),
        t("tunnels.deleteDomain"),
        t("common.cancel"),
        "warning",
        "tunnels",
      );
      if (confirmed) deleteDomainMut.mutate(selectedDomain.id);
    };
    const status = selectedDomain
      ? (STATUS_CONFIG[selectedDomain.status ?? "pending"] ??
        STATUS_CONFIG.pending)
      : null;
    const domainInfo = selectedDomain
      ? `Status: ${t(status?.labelKey ?? "tunnels.status.unknown")} · Zone ID: ${selectedDomain.id}`
      : "";
    const checking = checkCreatedDomainMut.isPending;
    const deleting =
      !!selectedDomain &&
      deleteDomainMut.isPending &&
      deleteDomainMut.variables === selectedDomain.id;
    const nameServers = selectedDomain?.name_servers ?? [];
    return (
      <div className="cloudflare-scope">
        <div className="cloudflare-scope__row">
          <Select
            className="cloudflare-scope__select"
            size="sm"
            value={selectedDomainId}
            onChange={setSelectedDomainId}
            options={safeDomains.map((domain) => ({
              value: domain.id,
              label: domain.name,
              dotTone: (STATUS_CONFIG[domain.status ?? 'pending']?.tone as any) ?? (domain.status === "active" ? "success" : "warning"),
            }))}
            searchable={safeDomains.length > SEARCH_FROM}
            placeholder={t("tunnels.pickDomain")}
          />
          <div className="cloudflare-scope__state">
            {selectedDomain ? (
              <>
                <button
                  type="button"
                  className="docker-icon-btn"
                  title={domainInfo}
                  aria-label={domainInfo}
                  onClick={() => {
                    if (isMobile) {
                      setShowDomainInfo(true);
                    } else {
                      navigator.clipboard
                        .writeText(selectedDomain.id)
                        .then(() => {
                          toast.success(`Zone ID tersalin: ${selectedDomain.id}`);
                        });
                    }
                  }}
                >
                  <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="docker-icon-btn"
                  title={
                    checking ? t("tunnels.checking") : t("tunnels.checkStatus")
                  }
                  aria-label={t("tunnels.checkStatus")}
                  disabled={checking}
                  onClick={() =>
                    checkCreatedDomainMut.mutate(selectedDomain.id)
                  }
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`}
                    strokeWidth={1.75}
                  />
                </button>
                <button
                  type="button"
                  className="docker-icon-btn hover:text-[var(--panel-danger-text)] hover:border-[var(--panel-danger-border)]"
                  title={t("tunnels.deleteDomainTitle")}
                  aria-label={t("tunnels.deleteDomainTitle")}
                  disabled={deleting}
                  onClick={() => void askDeleteDomain()}
                >
                  {deleting ? (
                    <RefreshCw
                      className="h-3.5 w-3.5 animate-spin"
                      strokeWidth={1.75}
                    />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </button>
              </>
            ) : null}
          </div>

          {selectedDomain && nameServers.length > 0 ? (
            <div className="cloudflare-scope__meta ml-auto">
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                NS:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {nameServers.map((ns, index) => (
                  <button
                    key={ns}
                    type="button"
                    className="cloudflare-ns-chip cursor-pointer"
                    title={t("tunnels.copy")}
                    onClick={() =>
                      navigator.clipboard
                        .writeText(ns)
                        .then(() =>
                          toast.success(
                            t("tunnels.nameserverCopied", { name: ns }),
                          ),
                        )
                    }
                  >
                    <span>NS{index + 1}</span>
                    <strong>{ns}</strong>
                    <Copy
                      className="h-2.5 w-2.5 opacity-60"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {isMobile && showDomainInfo && selectedDomain ? (
          <DomainInfoModal
            domain={selectedDomain}
            onClose={() => setShowDomainInfo(false)}
            onCheckStatus={() => checkCreatedDomainMut.mutate(selectedDomain.id)}
            checkingStatus={checking}
          />
        ) : null}
      </div>
    );
  }

  if (safeProfiles.length === 0) return null;
  const askDeleteProfile = async () => {
    if (!selectedProfile) return;
    const confirmed = await alertLib.confirm(
      t("tunnels.deleteProfileQuestion"),
      t("tunnels.deleteProfileMessage", { name: selectedProfile.name }),
      t("tunnels.deleteProfile"),
      t("common.cancel"),
      "warning",
      "tunnels",
    );
    if (confirmed) deleteProfileMut.mutate(selectedProfile.id);
  };
  const profileStatus = selectedProfile
    ? (STATUS_CONFIG[selectedProfile.status] ?? STATUS_CONFIG.pending)
    : null;
  const profileInfo = selectedProfile
    ? `Status: ${t(profileStatus?.labelKey ?? "tunnels.status.unknown")} · ID: ${selectedProfile.id}`
    : "";
  return (
    <div className="cloudflare-scope">
      <div className="cloudflare-scope__row">
        <Select
          className="cloudflare-scope__select"
          size="sm"
          value={selectedProfileId}
          onChange={setSelectedProfileId}
          options={safeProfiles.map((profile) => ({
            value: profile.id,
            label: profile.name || profile.id,
            dotTone: (STATUS_CONFIG[profile.status ?? 'pending']?.tone as any) ?? (profile.status === "healthy" || profile.status === "active" ? "success" : "warning"),
          }))}
          searchable={safeProfiles.length > SEARCH_FROM}
          placeholder={t("tunnels.pickProfile")}
        />
        <div className="cloudflare-scope__state">
          {selectedProfile ? (
            <>
              <button
                type="button"
                className="docker-icon-btn"
                title={profileInfo}
                aria-label={profileInfo}
                onClick={() => {
                  if (isMobile) {
                    setShowProfileInfo(true);
                  } else {
                    navigator.clipboard
                      .writeText(selectedProfile.id)
                      .then(() => {
                        toast.success(`Tunnel ID tersalin: ${selectedProfile.id}`);
                      });
                  }
                }}
              >
                <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="docker-icon-btn hover:text-[var(--panel-danger-text)] hover:border-[var(--panel-danger-border)]"
                title={t("tunnels.deleteProfileTitle")}
                aria-label={t("tunnels.deleteProfileTitle")}
                disabled={
                  deleteProfileMut.isPending || selectedProfile.id === "pending"
                }
                onClick={() => void askDeleteProfile()}
              >
                {deleteProfileMut.isPending &&
                deleteProfileMut.variables === selectedProfile.id ? (
                  <RefreshCw
                    className="h-3.5 w-3.5 animate-spin"
                    strokeWidth={1.75}
                  />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
            </>
          ) : null}
        </div>

        {selectedProfile ? (
          <div className="cloudflare-scope__meta ml-auto">
            <span>
              {selectedProfile.routeCount === 1
                ? t("tunnels.routeCount", { count: selectedProfile.routeCount })
                : t("tunnels.routesCount", {
                    count: selectedProfile.routeCount,
                  })}
            </span>
            <span className="opacity-30">&middot;</span>
            <span>
              {selectedProfile.daemonRunning
                ? t("tunnels.daemonRunning")
                : t("tunnels.daemonIdle")}
            </span>
            <span className="opacity-30">&middot;</span>
            <span className="panel-mono text-[11px]" title={selectedProfile.id}>
              ID {selectedProfile.id.slice(0, 8)}...
            </span>
          </div>
        ) : null}
      </div>

      {isMobile && showProfileInfo && selectedProfile ? (
        <ProfileInfoModal
          profile={selectedProfile}
          onClose={() => setShowProfileInfo(false)}
        />
      ) : null}
    </div>
  );
}

package httpserver

import (
	"net/http"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
)

// routes registers all HTTP route handlers on the server mux.
func (s *Server) routes() {
	// ── Public ──────────────────────────────────────────────────────────────
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/v1/frontend/revision", s.handleFrontendRevision)
	s.mux.Handle("GET /api/v1/settings/wallpaper", s.requireAuthV2(http.HandlerFunc(s.handleGetWallpaper)))
	s.mux.Handle("POST /api/v1/settings/wallpaper", s.requireAuthV2(http.HandlerFunc(s.handleUpdateWallpaper)))

	// ── Auth ─────────────────────────────────────────────────────────────────
	s.mux.HandleFunc("GET /api/v1/setup/status", s.handleSetupStatus)
	s.mux.HandleFunc("POST /api/v1/setup/initialize", s.handleInitializeSetup)
	s.mux.HandleFunc("POST /api/v1/auth/login", s.handleLoginV2)
	s.mux.Handle("POST /api/v1/auth/logout", s.requireAuthV2(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/v1/me", s.requireAuthV2(http.HandlerFunc(s.handleMeV2)))
	s.mux.Handle("POST /api/v1/settings/panel-primary/reset-password", s.requireRole(auth.SuperadminRole, s.requireCapability(auth.CapabilityPanelPrimaryReset, http.HandlerFunc(s.handleResetPrimaryPanelPassword))))

	// ── Users (admin+) ────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/users", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleListUsers)))
	s.mux.Handle("POST /api/v1/users", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleCreateUser)))
	s.mux.Handle("GET /api/v1/users/{id}", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleGetUser)))
	s.mux.Handle("PATCH /api/v1/users/{id}", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleUpdateUser)))
	s.mux.Handle("DELETE /api/v1/users/{id}", s.requireRole(auth.SuperadminRole, http.HandlerFunc(s.handleDeleteUser)))
	s.mux.Handle("POST /api/v1/users/{id}/suspend", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleSuspendUser)))
	s.mux.Handle("POST /api/v1/users/{id}/activate", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleActivateUser)))
	s.mux.Handle("GET /api/v1/users/{id}/quota", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleGetUserQuota)))
	s.mux.Handle("PATCH /api/v1/users/{id}/quota", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleUpdateUserQuota)))

	// ── Cloudflare (per-user) ─────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/me/cloudflare", s.requireAuthV2(http.HandlerFunc(s.handleGetCFConfig)))
	s.mux.Handle("POST /api/v1/me/cloudflare", s.requireAuthV2(http.HandlerFunc(s.handleSetCFConfig)))
	s.mux.Handle("DELETE /api/v1/me/cloudflare", s.requireAuthV2(http.HandlerFunc(s.handleDeleteCFConfig)))
	s.mux.Handle("POST /api/v1/me/cloudflare/verify", s.requireAuthV2(http.HandlerFunc(s.handleVerifyCFConfig)))
	s.mux.Handle("GET /api/v1/me/cloudflare/zones", s.requireAuthV2(http.HandlerFunc(s.handleGetCFZones)))
	s.mux.Handle("GET /api/v1/cloudflare/domains", s.requireAuthV2(http.HandlerFunc(s.handleCloudflareDomains)))
	s.mux.Handle("POST /api/v1/cloudflare/domains", s.requireAuthV2(http.HandlerFunc(s.handleCreateCloudflareDomain)))
	s.mux.Handle("GET /api/v1/cloudflare/domains/{zoneId}", s.requireAuthV2(http.HandlerFunc(s.handleGetCloudflareDomain)))
	s.mux.Handle("DELETE /api/v1/cloudflare/domains/{zoneId}", s.requireAuthV2(http.HandlerFunc(s.handleDeleteCloudflareDomain)))
	s.mux.Handle("GET /api/v1/cloudflare/domains/{zoneId}/dns", s.requireAuthV2(http.HandlerFunc(s.handleCloudflareDNSRecords)))
	s.mux.Handle("POST /api/v1/cloudflare/domains/{zoneId}/dns", s.requireAuthV2(http.HandlerFunc(s.handleCreateCloudflareDNSRecord)))
	s.mux.Handle("PUT /api/v1/cloudflare/domains/{zoneId}/dns/{recordId}", s.requireAuthV2(http.HandlerFunc(s.handleUpdateCloudflareDNSRecord)))
	s.mux.Handle("DELETE /api/v1/cloudflare/domains/{zoneId}/dns/{recordId}", s.requireAuthV2(http.HandlerFunc(s.handleDeleteCloudflareDNSRecord)))
	s.mux.Handle("GET /api/v1/cloudflare/tunnel-profiles", s.requireAuthV2(http.HandlerFunc(s.handleCloudflareTunnelProfiles)))
	s.mux.Handle("POST /api/v1/cloudflare/tunnel-profiles", s.requireAuthV2(http.HandlerFunc(s.handleCreateCloudflareTunnelProfile)))
	s.mux.Handle("DELETE /api/v1/cloudflare/tunnel-profiles/{profileId}", s.requireAuthV2(http.HandlerFunc(s.handleDeleteCloudflareTunnelProfile)))
	s.mux.Handle("GET /api/v1/cloudflare/tunnel-profiles/{profileId}/routes", s.requireAuthV2(http.HandlerFunc(s.handleCloudflareTunnelProfileRoutes)))

	// ── Projects ──────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/projects", s.requireAuthV2(http.HandlerFunc(s.handleListProjects)))
	s.mux.Handle("GET /api/v1/projects/attention-summary", s.requireAuthV2(http.HandlerFunc(s.handleProjectAttentionSummary)))
	s.mux.Handle("POST /api/v1/projects", s.requireAuthV2(http.HandlerFunc(s.handleCreateProject)))
	s.mux.Handle("POST /api/v1/projects/{id}/upload-static", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleUploadStaticProject)))
	s.mux.Handle("GET /api/v1/projects/{id}", s.requireAuthV2(http.HandlerFunc(s.handleGetProject)))
	s.mux.Handle("PUT /api/v1/projects/{id}", s.requireAuthV2(http.HandlerFunc(s.handleUpdateProject)))
	s.mux.Handle("DELETE /api/v1/projects/{id}", s.requireAuthV2(http.HandlerFunc(s.handleDeleteProject)))
	s.mux.Handle("POST /api/v1/projects/{id}/start", s.requireAuthV2(http.HandlerFunc(s.handleStartProject)))
	s.mux.Handle("POST /api/v1/projects/{id}/stop", s.requireAuthV2(http.HandlerFunc(s.handleStopProject)))

	// ── Tunnels ───────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/tunnels", s.requireAuthV2(http.HandlerFunc(s.handleListTunnels)))
	s.mux.Handle("POST /api/v1/tunnels", s.requireAuthV2(http.HandlerFunc(s.handleCreateTunnel)))
	s.mux.Handle("GET /api/v1/tunnels/{id}", s.requireAuthV2(http.HandlerFunc(s.handleGetTunnel)))
	s.mux.Handle("PUT /api/v1/tunnels/{id}", s.requireAuthV2(http.HandlerFunc(s.handleUpdateTunnel)))
	s.mux.Handle("DELETE /api/v1/tunnels/{id}", s.requireAuthV2(http.HandlerFunc(s.handleDeleteTunnel)))

	// ── Docs ──────────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/docs", s.requireAuthV2(http.HandlerFunc(s.handleListDocs)))
	s.mux.Handle("POST /api/v1/docs", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleCreateDoc)))
	s.mux.Handle("GET /api/v1/docs/{id}", s.requireAuthV2(http.HandlerFunc(s.handleGetDoc)))
	s.mux.Handle("PATCH /api/v1/docs/{id}", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleUpdateDoc)))
	s.mux.Handle("DELETE /api/v1/docs/{id}", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleDeleteDoc)))

	// ── Notifications ────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/notifications", s.requireAuthV2(http.HandlerFunc(s.handleListNotifications)))
	s.mux.Handle("GET /api/v1/notifications/ws", s.requireAuthV2(http.HandlerFunc(s.handleNotificationsWebSocket)))
	s.mux.Handle("POST /api/v1/notifications/{id}/read", s.requireAuthV2(http.HandlerFunc(s.handleMarkNotificationRead)))
	s.mux.Handle("POST /api/v1/notifications/read-all", s.requireAuthV2(http.HandlerFunc(s.handleMarkAllNotificationsRead)))

	// ── System / Settings ─────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/system/summary", s.requireAuthV2(http.HandlerFunc(s.handleSystemSummary)))
	s.mux.Handle("GET /api/v1/system/logs", s.requireAuthV2(http.HandlerFunc(s.handleSystemLogs)))
	s.mux.Handle("GET /api/v1/system/changelog", s.requireAuthV2(http.HandlerFunc(s.handleSystemChangelog)))
	s.mux.Handle("GET /api/v1/database/status", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleDatabaseStatus)))
	s.mux.Handle("POST /api/v1/database/truncate", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilityDatabaseTruncate, http.HandlerFunc(s.handleDatabaseTruncate))))
	s.mux.Handle("GET /api/v1/settings/system", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleGetSystemSettings)))
	s.mux.Handle("POST /api/v1/settings/system", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilitySystemSettingsWrite, http.HandlerFunc(s.handleUpdateSystemSettings))))
	s.mux.Handle("POST /api/v1/settings/panel-port", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilitySystemSettingsWrite, http.HandlerFunc(s.handleUpdatePanelPort))))
	s.mux.Handle("POST /api/v1/settings/panel-origins", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilitySystemSettingsWrite, http.HandlerFunc(s.handleUpdatePanelOrigins))))

	// ── Payment Gateway Settings ─────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/settings/payment", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleGetPaymentSettings)))
	s.mux.Handle("POST /api/v1/settings/payment", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilitySystemSettingsWrite, http.HandlerFunc(s.handleUpdatePaymentSettings))))
	s.mux.Handle("POST /api/v1/settings/payment/test", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleTestPaymentGateway)))

	// ── Notification Listener (Android) ──────────────────────────────────────
	s.mux.Handle("GET /api/v1/notification-devices", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleListNotificationDevices)))
	s.mux.Handle("POST /api/v1/notification-devices", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleRegisterNotificationDevice)))
	s.mux.Handle("PUT /api/v1/notification-devices/{deviceId}", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleUpdateNotificationDevice)))
	s.mux.Handle("DELETE /api/v1/notification-devices/{deviceId}", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleDeleteNotificationDevice)))
	s.mux.Handle("GET /api/v1/captured-notifications", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleListCapturedNotifications)))
	s.mux.Handle("GET /api/v1/captured-notifications/ws", s.requireRole(auth.AdminRole, http.HandlerFunc(s.handleCapturedNotificationsWS)))

	// ── Notification Webhook (Public — secured via API key in header) ────────
	s.mux.HandleFunc("POST /api/v1/webhooks/notifications", s.handleNotificationWebhook)

	// ── Files ────────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/files/root-access/status", s.requireAuthV2(http.HandlerFunc(s.handleFileRootAccessStatus)))
	s.mux.Handle("POST /api/v1/files/root-access/verify", s.requireAuthV2(http.HandlerFunc(s.handleFileRootAccessVerify)))
	s.mux.Handle("POST /api/v1/files/root-access/revoke", s.requireAuthV2(http.HandlerFunc(s.handleFileRootAccessRevoke)))
	s.mux.Handle("GET /api/v1/files", s.requireAuthV2(http.HandlerFunc(s.handleFileManagerList)))
	s.mux.Handle("GET /api/v1/files/read", s.requireAuthV2(http.HandlerFunc(s.handleFileManagerRead)))
	s.mux.Handle("POST /api/v1/files/write", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerWrite)))
	s.mux.Handle("POST /api/v1/files/delete", s.requireCapability(auth.CapabilityFilesDelete, http.HandlerFunc(s.handleFileManagerDelete)))
	s.mux.Handle("POST /api/v1/files/rename", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerRename)))
	s.mux.Handle("POST /api/v1/files/move", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerMove)))
	s.mux.Handle("POST /api/v1/files/copy", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerCopy)))
	s.mux.Handle("POST /api/v1/files/mkdir", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerMkdir)))
	s.mux.Handle("POST /api/v1/files/touch", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerTouch)))
	s.mux.Handle("POST /api/v1/files/chmod", s.requireCapability(auth.CapabilityFilesChmod, http.HandlerFunc(s.handleFileManagerChmod)))
	s.mux.Handle("POST /api/v1/files/compress", s.requireCapability(auth.CapabilityFilesWrite, http.HandlerFunc(s.handleFileManagerCompress)))
	s.mux.Handle("POST /api/v1/files/extract", s.requireCapability(auth.CapabilityFilesExtract, http.HandlerFunc(s.handleFileManagerExtract)))

	// ── Containers ────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/v1/containers", s.requireAuthV2(http.HandlerFunc(s.handleContainersList)))
	s.mux.Handle("GET /api/v1/containers/owners", s.requireAuthV2(http.HandlerFunc(s.handleContainerOwners)))
	s.mux.Handle("POST /api/v1/containers/deploy-image", s.requireCapability(auth.CapabilityDockerDeploy, http.HandlerFunc(s.handleContainerDeployImage)))
	s.mux.Handle("POST /api/v1/containers/deploy-compose", s.requireCapability(auth.CapabilityDockerDeploy, http.HandlerFunc(s.handleContainerDeployCompose)))
	s.mux.Handle("POST /api/v1/containers/{id}/start", s.requireCapability(auth.CapabilityDockerLifecycle, http.HandlerFunc(s.handleContainerStart)))
	s.mux.Handle("POST /api/v1/containers/{id}/stop", s.requireCapability(auth.CapabilityDockerLifecycle, http.HandlerFunc(s.handleContainerStop)))
	s.mux.Handle("POST /api/v1/containers/{id}/restart", s.requireCapability(auth.CapabilityDockerLifecycle, http.HandlerFunc(s.handleContainerRestart)))
	s.mux.Handle("DELETE /api/v1/containers/{id}", s.requireCapability(auth.CapabilityDockerLifecycle, http.HandlerFunc(s.handleContainerDelete)))
	s.mux.Handle("GET /api/v1/containers/{id}/config", s.requireAuthV2(http.HandlerFunc(s.handleContainerInspectConfig)))
	s.mux.Handle("GET /api/v1/containers/{id}/logs", s.requireAuthV2(http.HandlerFunc(s.handleContainerLogs)))

	// ── Docker Networks & Images & Templates ──────────────────────────────────
	s.mux.Handle("GET /api/v1/docker/networks", s.requireAuthV2(http.HandlerFunc(s.handleDockerNetworksList)))
	s.mux.Handle("POST /api/v1/docker/networks", s.requireCapability(auth.CapabilityDockerNetworkManage, http.HandlerFunc(s.handleDockerNetworkCreate)))
	s.mux.Handle("DELETE /api/v1/docker/networks/{id}", s.requireCapability(auth.CapabilityDockerNetworkManage, http.HandlerFunc(s.handleDockerNetworkDelete)))
	s.mux.Handle("GET /api/v1/docker/images", s.requireAuthV2(http.HandlerFunc(s.handleDockerImagesList)))
	s.mux.Handle("POST /api/v1/docker/images/pull", s.requireCapability(auth.CapabilityDockerImageManage, http.HandlerFunc(s.handleDockerImagePull)))
	s.mux.Handle("GET /api/v1/docker/image-in-use", s.requireAuthV2(http.HandlerFunc(s.handleImageInUse)))
	s.mux.Handle("DELETE /api/v1/docker/images/{id}", s.requireCapability(auth.CapabilityDockerImageManage, http.HandlerFunc(s.handleDockerImageDelete)))
	s.mux.Handle("GET /api/v1/docker/templates", s.requireAuthV2(http.HandlerFunc(s.handleDockerTemplatesList)))
	s.mux.Handle("POST /api/v1/docker/templates", s.requireCapability(auth.CapabilityDockerTemplateManage, http.HandlerFunc(s.handleDockerTemplateCreate)))
	s.mux.Handle("PUT /api/v1/docker/templates/{id}", s.requireCapability(auth.CapabilityDockerTemplateManage, http.HandlerFunc(s.handleDockerTemplateUpdate)))
	s.mux.Handle("DELETE /api/v1/docker/templates/{id}", s.requireCapability(auth.CapabilityDockerTemplateManage, http.HandlerFunc(s.handleDockerTemplateDelete)))

	// ── Terminal ──────────────────────────────────────────────────────────────
	s.mux.Handle("POST /api/v1/terminal/sessions", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilityTerminalAccess, http.HandlerFunc(s.handleTerminalSessionStart))))
	s.mux.Handle("GET /api/v1/terminal/sessions/{id}/ws", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilityTerminalAccess, http.HandlerFunc(s.handleTerminalSessionWebSocket))))
	s.mux.Handle("DELETE /api/v1/terminal/sessions/{id}", s.requireRole(auth.AdminRole, s.requireCapability(auth.CapabilityTerminalAccess, http.HandlerFunc(s.handleTerminalSessionClose))))
	s.mux.Handle("GET /api/v1/system/stats/ws", s.requireAuthV2(http.HandlerFunc(s.handleSystemStatsWebSocket)))
	s.mux.Handle("GET /api/v1/terminal/presets", s.requireAuthV2(http.HandlerFunc(s.handleListTerminalPresets)))
	s.mux.Handle("POST /api/v1/terminal/presets", s.requireAuthV2(http.HandlerFunc(s.handleCreateTerminalPreset)))
	s.mux.Handle("DELETE /api/v1/terminal/presets/{id}", s.requireAuthV2(http.HandlerFunc(s.handleDeleteTerminalPreset)))
	s.mux.Handle("POST /api/v1/terminal/presets/reset", s.requireAuthV2(http.HandlerFunc(s.handleResetTerminalPresets)))

	s.mux.Handle("/", s.authedFrontend)
}

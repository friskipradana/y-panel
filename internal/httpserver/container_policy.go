package httpserver

import (
	"fmt"
	"log"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

// policySweepEvery is how many reconcile rounds pass between two looks at every container
const policySweepEvery = 5

// enforceContainerPolicy stops a running container of a hosting account that reaches the Docker daemon,
// the host's namespaces, devices or folders outside its owner's own. Deployments through the panel are
// refused before they start (docker.CheckComposePolicy); this catches what got through another way,
// such as a compose file whose values come from a variable. Containers nobody owns are left alone.
func (s *Server) enforceContainerPolicy() {
	if s == nil || s.database == nil || !s.database.IsConnected() {
		return
	}
	homeOf := func(ownerID int64) string {
		owner, err := s.database.GetUserByID(ownerID)
		if err != nil || owner == nil {
			return ""
		}
		return panelosuser.ResolveHomeDir(owner.Username)
	}
	violations, err := docker.ContainerViolations(homeOf)
	if err != nil {
		return
	}
	for _, v := range violations {
		if v.OwnerID == 0 || !v.RunningNow {
			continue
		}
		owner, err := s.database.GetUserByID(v.OwnerID)
		if err != nil || owner == nil || docker.IsPolicyExempt(owner.Role) {
			continue
		}
		if err := docker.StopViolating(v.ID); err != nil {
			log.Printf("[container-policy] %v", err)
			continue
		}
		reasons := strings.Join(v.Reasons, ", ")
		log.Printf("[container-policy] stopped %s of %s: %s", v.Name, owner.Username, reasons)
		s.recordRuntimeLog("warn", "container stopped by policy", map[string]any{"container": v.Name, "image": v.Image, "owner": owner.Username, "reasons": v.Reasons})
		s.notifyUserAction(owner.ID, "Container dihentikan", fmt.Sprintf("Container '%s' dihentikan: meminta akses ke host (%s). Akun hosting tidak boleh menjalankannya.", v.Name, reasons), "warning")
	}
}

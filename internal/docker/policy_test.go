package docker

import "testing"

func TestCheckComposePolicyRefusesWhatReachesTheHost(t *testing.T) {
	refused := map[string]string{
		"portainer image":  "services:\n  ui:\n    image: portainer/portainer-ce:latest\n",
		"docker socket":    "services:\n  a:\n    image: nginx\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n",
		"socket long form": "services:\n  a:\n    image: nginx\n    volumes:\n      - type: bind\n        source: /run/docker.sock\n        target: /s\n",
		"privileged":       "services:\n  a:\n    image: nginx\n    privileged: true\n",
		"host pid":         "services:\n  a:\n    image: nginx\n    pid: host\n",
		"host network":     "services:\n  a:\n    image: nginx\n    network_mode: \"host\"\n",
		"sys admin":        "services:\n  a:\n    image: nginx\n    cap_add:\n      - SYS_ADMIN\n",
		"cap list":         "services:\n  a:\n    image: nginx\n    cap_add: [NET_BIND_SERVICE, ALL]\n",
		"unconfined":       "services:\n  a:\n    image: nginx\n    security_opt:\n      - seccomp=unconfined\n",
		"devices":          "services:\n  a:\n    image: nginx\n    devices:\n      - /dev/mem:/dev/mem\n",
		"outside folder":   "services:\n  a:\n    image: nginx\n    volumes:\n      - type: bind\n        source: /etc\n        target: /e\n",
		"watchtower":       "services:\n  w:\n    image: containrrr/watchtower\n",
	}
	for name, yaml := range refused {
		if err := CheckComposePolicy(yaml, "/home/ana"); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	allowed := map[string]string{
		"plain":         "services:\n  web:\n    image: nginx:1.27\n    ports:\n      - \"8080:80\"\n    restart: unless-stopped\n",
		"own folder":    "services:\n  a:\n    image: nginx\n    volumes:\n      - /home/ana/site:/usr/share/nginx/html:ro\n",
		"named volume":  "services:\n  a:\n    image: postgres\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:\n",
		"harmless cap":  "services:\n  a:\n    image: nginx\n    cap_add:\n      - NET_BIND_SERVICE\n",
		"commented out": "services:\n  a:\n    image: nginx\n    # privileged: true\n",
	}
	for name, yaml := range allowed {
		if err := CheckComposePolicy(yaml, "/home/ana"); err != nil {
			t.Errorf("%s must be allowed: %v", name, err)
		}
	}
}

func TestReasonsOfJudgesARealContainer(t *testing.T) {
	var doc inspectDoc
	doc.Config.Image = "nginx"
	doc.HostConfig.Binds = []string{"pgdata:/var/lib/postgresql/data", "/home/ana/site:/site:ro"}
	if reasons := reasonsOf(doc, "/home/ana"); len(reasons) != 0 {
		t.Fatalf("a normal container has no reasons: %v", reasons)
	}
	doc.HostConfig.Binds = append(doc.HostConfig.Binds, "/var/run/docker.sock:/var/run/docker.sock", "/etc:/host-etc")
	doc.HostConfig.Privileged = true
	doc.HostConfig.PidMode = "host"
	reasons := reasonsOf(doc, "/home/ana")
	if len(reasons) < 4 {
		t.Fatalf("want privileged, pid, socket and outside folder, got %v", reasons)
	}
}

func TestCheckNetworkPolicy(t *testing.T) {
	if CheckNetworkPolicy("host") == nil || CheckNetworkPolicy("bridge") != nil || CheckNetworkPolicy("") != nil {
		t.Fatal("only the host network is refused")
	}
}

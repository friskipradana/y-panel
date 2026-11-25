package k8s

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	K3sKubeconfigPath = "/etc/rancher/k3s/k3s.yaml"
	K3sTokenPath      = "/var/lib/rancher/k3s/server/node-token"
	K3sUninstallBin   = "/usr/local/bin/k3s-uninstall.sh"
)

var (
	validNameRe      = regexp.MustCompile(`^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$`)
	validNamespaceRe = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)
	validContainerRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)
	allowedKinds     = map[string]string{
		"pod":        "pod",
		"pods":       "pod",
		"deployment": "deployment",
		"service":    "service",
		"ingress":    "ingress",
		"configmap":  "configmap",
		"secret":     "secret",
		"namespace":  "namespace",
		"node":       "node",
	}
)

// ValidResourceName checks RFC 1123 Kubernetes resource naming.
func ValidResourceName(name string) bool {
	return len(name) > 0 && len(name) <= 253 && validNameRe.MatchString(name)
}

// ValidNamespace checks RFC 1123 DNS label naming for Kubernetes namespaces.
func ValidNamespace(ns string) bool {
	return len(ns) > 0 && len(ns) <= 63 && validNamespaceRe.MatchString(ns)
}

// NormalizeKind maps an API kind parameter to an allowlisted kubectl resource kind.
func NormalizeKind(kind string) (string, bool) {
	k, ok := allowedKinds[strings.ToLower(strings.TrimSpace(kind))]
	return k, ok
}

// HostStatus describes local kubectl/K3s availability on the Reneo host machine.
type HostStatus struct {
	OS                string `json:"os"`
	KubectlInstalled  bool   `json:"kubectlInstalled"`
	KubectlPath       string `json:"kubectlPath"`
	K3sInstalled      bool   `json:"k3sInstalled"`
	K3sRunning        bool   `json:"k3sRunning"`
	K3sKubeconfig     bool   `json:"k3sKubeconfig"`
	CanInstallK3s     bool   `json:"canInstallK3s"`
	CanUninstallK3s   bool   `json:"canUninstallK3s"`
	HostIP            string `json:"hostIp"`
}

// DetectHost inspects local kubectl and K3s binaries/services without modifying host state.
func DetectHost(ctx context.Context) HostStatus {
	st := HostStatus{
		OS:            runtime.GOOS,
		CanInstallK3s: runtime.GOOS == "linux",
		HostIP:        detectPrimaryIP(),
	}
	if bin, err := findKubectlBin(); err == nil {
		st.KubectlInstalled = true
		st.KubectlPath = bin
	}
	if _, err := exec.LookPath("k3s"); err == nil {
		st.K3sInstalled = true
	}
	if _, err := os.Stat(K3sKubeconfigPath); err == nil {
		st.K3sKubeconfig = true
	}
	if _, err := os.Stat(K3sUninstallBin); err == nil {
		st.CanUninstallK3s = true
	}
	if runtime.GOOS == "linux" && st.K3sInstalled {
		c, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		out, err := exec.CommandContext(c, "systemctl", "is-active", "k3s").Output()
		if err == nil && strings.TrimSpace(string(out)) == "active" {
			st.K3sRunning = true
		}
	}
	return st
}

func detectPrimaryIP() string {
	conn, err := net.DialTimeout("udp", "1.1.1.1:80", 400*time.Millisecond)
	if err == nil {
		defer conn.Close()
		if addr, ok := conn.LocalAddr().(*net.UDPAddr); ok && addr.IP != nil {
			return addr.IP.String()
		}
	}
	return "127.0.0.1"
}

// ReadLocalK3sJoinCommand returns the K3s agent join command for adding worker nodes.
func ReadLocalK3sJoinCommand() (serverURL string, token string, command string, err error) {
	if runtime.GOOS != "linux" {
		return "", "", "", errors.New("K3s hanya tersedia di host Linux")
	}
	raw, err := os.ReadFile(K3sTokenPath)
	if err != nil {
		return "", "", "", fmt.Errorf("token K3s tidak dapat dibaca di %s: %w", K3sTokenPath, err)
	}
	token = strings.TrimSpace(string(raw))
	if token == "" {
		return "", "", "", errors.New("token K3s kosong")
	}
	ip := detectPrimaryIP()
	serverURL = fmt.Sprintf("https://%s:6443", ip)
	command = fmt.Sprintf("curl -sfL https://get.k3s.io | K3S_URL=%s K3S_TOKEN=%s sh -", serverURL, token)
	return serverURL, token, command, nil
}

// K3sInstallOptions controls optional K3s installation flags.
type K3sInstallOptions struct {
	DisableTraefik bool `json:"disableTraefik"`
}

// InstallK3s runs the official K3s installer on Linux and streams log lines to onLine.
func InstallK3s(ctx context.Context, opts K3sInstallOptions, onLine func(line string)) error {
	if runtime.GOOS != "linux" {
		return errors.New("pemasangan K3s otomatis hanya didukung pada host Linux")
	}
	installArgs := []string{"--write-kubeconfig-mode", "644"}
	if opts.DisableTraefik {
		installArgs = append(installArgs, "--disable", "traefik")
	}
	cmdStr := "curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='" + strings.Join(installArgs, " ") + "' sh -"
	cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)
	return streamCommand(cmd, onLine)
}

// UninstallK3s removes K3s using its official uninstall script on Linux.
func UninstallK3s(ctx context.Context, onLine func(line string)) error {
	if runtime.GOOS != "linux" {
		return errors.New("pencopotan K3s hanya didukung pada host Linux")
	}
	if _, err := os.Stat(K3sUninstallBin); err != nil {
		return errors.New("skrip k3s-uninstall.sh tidak ditemukan di host")
	}
	cmd := exec.CommandContext(ctx, K3sUninstallBin)
	return streamCommand(cmd, onLine)
}

func streamCommand(cmd *exec.Cmd, onLine func(string)) error {
	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw
	if err := cmd.Start(); err != nil {
		_ = pr.Close()
		_ = pw.Close()
		return err
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 4096), 256*1024)
		for sc.Scan() {
			if onLine != nil {
				onLine(sc.Text())
			}
		}
	}()
	waitErr := cmd.Wait()
	_ = pw.Close()
	<-done
	_ = pr.Close()
	return waitErr
}

// ParseKubeconfigMeta validates minimal kubeconfig structure and extracts the first cluster server URL.
func ParseKubeconfigMeta(raw string) (apiServer string, err error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("kubeconfig tidak boleh kosong")
	}
	if !strings.Contains(trimmed, "clusters:") || !strings.Contains(trimmed, "users:") {
		return "", errors.New("format kubeconfig tidak valid (harus memuat bagian clusters dan users)")
	}
	for _, line := range strings.Split(trimmed, "\n") {
		l := strings.TrimSpace(line)
		if strings.HasPrefix(l, "server:") {
			val := strings.TrimSpace(strings.TrimPrefix(l, "server:"))
			val = strings.Trim(val, `"'`)
			if val != "" {
				return val, nil
			}
		}
	}
	return "", errors.New("alamat server API (server:) tidak ditemukan di dalam kubeconfig")
}

func findKubectlBin() (string, error) {
	if p, err := exec.LookPath("kubectl"); err == nil {
		return p, nil
	}
	if p, err := exec.LookPath("k3s"); err == nil {
		return p, nil
	}
	for _, candidate := range []string{"/usr/local/bin/kubectl", "/usr/bin/kubectl", "/usr/local/bin/k3s"} {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}
	return "", errors.New("kubectl atau k3s tidak terpasang di host server")
}

// runKubectl executes kubectl with an isolated temporary kubeconfig file (or local K3s path).
func runKubectl(ctx context.Context, kubeconfig string, stdin []byte, args ...string) ([]byte, error) {
	bin, err := findKubectlBin()
	if err != nil {
		return nil, err
	}

	var kubeFile string
	var cleanup func()
	if kubeconfig == "__k3s_local__" {
		if _, statErr := os.Stat(K3sKubeconfigPath); statErr != nil {
			return nil, fmt.Errorf("berkas kubeconfig K3s lokal tidak ditemukan di %s", K3sKubeconfigPath)
		}
		kubeFile = K3sKubeconfigPath
	} else {
		tmp, tmpErr := os.CreateTemp("", "reneo-kube-*.yaml")
		if tmpErr != nil {
			return nil, tmpErr
		}
		kubeFile = tmp.Name()
		cleanup = func() { _ = os.Remove(kubeFile) }
		_ = tmp.Chmod(0o600)
		if _, writeErr := tmp.WriteString(kubeconfig); writeErr != nil {
			_ = tmp.Close()
			cleanup()
			return nil, writeErr
		}
		_ = tmp.Close()
	}
	if cleanup != nil {
		defer cleanup()
	}

	fullArgs := make([]string, 0, len(args)+4)
	if strings.HasSuffix(strings.ToLower(bin), "k3s") || strings.HasSuffix(strings.ToLower(bin), "k3s.exe") {
		fullArgs = append(fullArgs, "kubectl")
	}
	fullArgs = append(fullArgs, "--kubeconfig", kubeFile)
	fullArgs = append(fullArgs, args...)

	cmd := exec.CommandContext(ctx, bin, fullArgs...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = strings.TrimSpace(stdout.String())
		}
		if errMsg == "" {
			errMsg = err.Error()
		}
		return nil, errors.New(errMsg)
	}
	return stdout.Bytes(), nil
}

// ClusterSummary aggregates live counts from a Kubernetes cluster.
type ClusterSummary struct {
	ServerVersion   string `json:"serverVersion"`
	NodesTotal      int    `json:"nodesTotal"`
	NodesReady      int    `json:"nodesReady"`
	NamespacesTotal int    `json:"namespacesTotal"`
	PodsTotal       int    `json:"podsTotal"`
	PodsRunning     int    `json:"podsRunning"`
	PodsPending     int    `json:"podsPending"`
	PodsFailed      int    `json:"podsFailed"`
	Deployments     int    `json:"deployments"`
	Services        int    `json:"services"`
}

type NodeInfo struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Roles      string `json:"roles"`
	Version    string `json:"version"`
	InternalIP string `json:"internalIp"`
	OSImage    string `json:"osImage"`
	CPU        string `json:"cpu"`
	Memory     string `json:"memory"`
	CreatedAt  string `json:"createdAt"`
}

type PodInfo struct {
	Name       string   `json:"name"`
	Namespace  string   `json:"namespace"`
	Status     string   `json:"status"`
	Ready      string   `json:"ready"`
	Restarts   int      `json:"restarts"`
	NodeName   string   `json:"nodeName"`
	PodIP      string   `json:"podIp"`
	Containers []string `json:"containers"`
	CreatedAt  string   `json:"createdAt"`
}

type DeploymentInfo struct {
	Name              string `json:"name"`
	Namespace         string `json:"namespace"`
	Replicas          int    `json:"replicas"`
	ReadyReplicas     int    `json:"readyReplicas"`
	AvailableReplicas int    `json:"availableReplicas"`
	Image             string `json:"image"`
	CreatedAt         string `json:"createdAt"`
}

type ServicePort struct {
	Name       string `json:"name"`
	Port       int    `json:"port"`
	TargetPort string `json:"targetPort"`
	NodePort   int    `json:"nodePort"`
	Protocol   string `json:"protocol"`
}

type ServiceInfo struct {
	Name       string        `json:"name"`
	Namespace  string        `json:"namespace"`
	Type       string        `json:"type"`
	ClusterIP  string        `json:"clusterIp"`
	ExternalIP string        `json:"externalIp"`
	Ports      []ServicePort `json:"ports"`
	CreatedAt  string        `json:"createdAt"`
}

type IngressInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	ClassName string   `json:"className"`
	Hosts     []string `json:"hosts"`
	CreatedAt string   `json:"createdAt"`
}

type ConfigResource struct {
	Kind      string   `json:"kind"` // "ConfigMap" | "Secret"
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Type      string   `json:"type,omitempty"`
	Keys      []string `json:"keys"`
	CreatedAt string   `json:"createdAt"`
}

func nsArgs(ns string) []string {
	ns = strings.TrimSpace(ns)
	if ns == "" || ns == "all" || ns == "*" {
		return []string{"--all-namespaces"}
	}
	return []string{"-n", ns}
}

func ListNamespaces(ctx context.Context, kubeconfig string) ([]string, error) {
	out, err := runKubectl(ctx, kubeconfig, nil, "get", "namespaces", "-o", "json")
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Items []struct {
			Metadata struct {
				Name string `json:"name"`
			} `json:"metadata"`
		} `json:"items"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(parsed.Items))
	for _, it := range parsed.Items {
		if it.Metadata.Name != "" {
			names = append(names, it.Metadata.Name)
		}
	}
	sort.Strings(names)
	return names, nil
}

func CreateNamespace(ctx context.Context, kubeconfig, name string) error {
	if !ValidNamespace(name) {
		return errors.New("nama namespace hanya boleh huruf kecil, angka, dan tanda hubung")
	}
	_, err := runKubectl(ctx, kubeconfig, nil, "create", "namespace", name)
	return err
}

func ListNodes(ctx context.Context, kubeconfig string) ([]NodeInfo, error) {
	out, err := runKubectl(ctx, kubeconfig, nil, "get", "nodes", "-o", "json")
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Items []struct {
			Metadata struct {
				Name              string            `json:"name"`
				Labels            map[string]string `json:"labels"`
				CreationTimestamp string            `json:"creationTimestamp"`
			} `json:"metadata"`
			Status struct {
				Conditions []struct {
					Type   string `json:"type"`
					Status string `json:"status"`
				} `json:"conditions"`
				Addresses []struct {
					Type    string `json:"type"`
					Address string `json:"address"`
				} `json:"addresses"`
				Capacity map[string]string `json:"capacity"`
				NodeInfo struct {
					KubeletVersion string `json:"kubeletVersion"`
					OSImage        string `json:"osImage"`
				} `json:"nodeInfo"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	nodes := make([]NodeInfo, 0, len(parsed.Items))
	for _, item := range parsed.Items {
		status := "NotReady"
		for _, cond := range item.Status.Conditions {
			if cond.Type == "Ready" && cond.Status == "True" {
				status = "Ready"
			}
		}
		var roles []string
		for k := range item.Metadata.Labels {
			if strings.HasPrefix(k, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(k, "node-role.kubernetes.io/")
				if role != "" {
					roles = append(roles, role)
				}
			}
		}
		sort.Strings(roles)
		roleStr := "worker"
		if len(roles) > 0 {
			roleStr = strings.Join(roles, ", ")
		}
		ip := ""
		for _, a := range item.Status.Addresses {
			if a.Type == "InternalIP" {
				ip = a.Address
				break
			}
		}
		nodes = append(nodes, NodeInfo{
			Name:       item.Metadata.Name,
			Status:     status,
			Roles:      roleStr,
			Version:    item.Status.NodeInfo.KubeletVersion,
			InternalIP: ip,
			OSImage:    item.Status.NodeInfo.OSImage,
			CPU:        item.Status.Capacity["cpu"],
			Memory:     item.Status.Capacity["memory"],
			CreatedAt:  item.Metadata.CreationTimestamp,
		})
	}
	return nodes, nil
}

func ListPods(ctx context.Context, kubeconfig, namespace string) ([]PodInfo, error) {
	args := append([]string{"get", "pods"}, nsArgs(namespace)...)
	args = append(args, "-o", "json")
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Items []struct {
			Metadata struct {
				Name              string `json:"name"`
				Namespace         string `json:"namespace"`
				CreationTimestamp string `json:"creationTimestamp"`
			} `json:"metadata"`
			Spec struct {
				NodeName   string `json:"nodeName"`
				Containers []struct {
					Name string `json:"name"`
				} `json:"containers"`
			} `json:"spec"`
			Status struct {
				Phase             string `json:"phase"`
				PodIP             string `json:"podIP"`
				ContainerStatuses []struct {
					Ready        bool `json:"ready"`
					RestartCount int  `json:"restartCount"`
					State        struct {
						Waiting *struct {
							Reason string `json:"reason"`
						} `json:"waiting"`
					} `json:"state"`
				} `json:"containerStatuses"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	pods := make([]PodInfo, 0, len(parsed.Items))
	for _, it := range parsed.Items {
		readyCount := 0
		restarts := 0
		status := it.Status.Phase
		for _, cs := range it.Status.ContainerStatuses {
			if cs.Ready {
				readyCount++
			}
			restarts += cs.RestartCount
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				status = cs.State.Waiting.Reason
			}
		}
		containers := make([]string, 0, len(it.Spec.Containers))
		for _, c := range it.Spec.Containers {
			containers = append(containers, c.Name)
		}
		pods = append(pods, PodInfo{
			Name:       it.Metadata.Name,
			Namespace:  it.Metadata.Namespace,
			Status:     status,
			Ready:      fmt.Sprintf("%d/%d", readyCount, len(it.Spec.Containers)),
			Restarts:   restarts,
			NodeName:   it.Spec.NodeName,
			PodIP:      it.Status.PodIP,
			Containers: containers,
			CreatedAt:  it.Metadata.CreationTimestamp,
		})
	}
	return pods, nil
}

func DeletePod(ctx context.Context, kubeconfig, namespace, name string) error {
	if !ValidNamespace(namespace) || !ValidResourceName(name) {
		return errors.New("nama pod atau namespace tidak valid")
	}
	_, err := runKubectl(ctx, kubeconfig, nil, "delete", "pod", name, "-n", namespace)
	return err
}

func PodLogs(ctx context.Context, kubeconfig, namespace, name, container string, tail int) (string, error) {
	if !ValidNamespace(namespace) || !ValidResourceName(name) {
		return "", errors.New("nama pod atau namespace tidak valid")
	}
	if tail <= 0 || tail > 2000 {
		tail = 200
	}
	args := []string{"logs", name, "-n", namespace, "--tail", strconv.Itoa(tail)}
	if c := strings.TrimSpace(container); c != "" {
		if !validContainerRe.MatchString(c) {
			return "", errors.New("nama container tidak valid")
		}
		args = append(args, "-c", c)
	}
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// ExecPodCommand runs a single shell command inside a pod container via kubectl exec.
func ExecPodCommand(ctx context.Context, kubeconfig, namespace, name, container, command string) (string, error) {
	if !ValidNamespace(namespace) || !ValidResourceName(name) {
		return "", errors.New("nama pod atau namespace tidak valid")
	}
	cmdStr := strings.TrimSpace(command)
	if cmdStr == "" {
		return "", errors.New("perintah tidak boleh kosong")
	}
	args := []string{"exec", name, "-n", namespace}
	if c := strings.TrimSpace(container); c != "" {
		if !validContainerRe.MatchString(c) {
			return "", errors.New("nama container tidak valid")
		}
		args = append(args, "-c", c)
	}
	args = append(args, "--", "sh", "-c", cmdStr)
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return string(out), err
	}
	return string(out), nil
}

func ListDeployments(ctx context.Context, kubeconfig, namespace string) ([]DeploymentInfo, error) {
	args := append([]string{"get", "deployments"}, nsArgs(namespace)...)
	args = append(args, "-o", "json")
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Items []struct {
			Metadata struct {
				Name              string `json:"name"`
				Namespace         string `json:"namespace"`
				CreationTimestamp string `json:"creationTimestamp"`
			} `json:"metadata"`
			Spec struct {
				Replicas *int `json:"replicas"`
				Template struct {
					Spec struct {
						Containers []struct {
							Image string `json:"image"`
						} `json:"containers"`
					} `json:"spec"`
				} `json:"template"`
			} `json:"spec"`
			Status struct {
				ReadyReplicas     int `json:"readyReplicas"`
				AvailableReplicas int `json:"availableReplicas"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	outList := make([]DeploymentInfo, 0, len(parsed.Items))
	for _, it := range parsed.Items {
		rep := 1
		if it.Spec.Replicas != nil {
			rep = *it.Spec.Replicas
		}
		img := ""
		if len(it.Spec.Template.Spec.Containers) > 0 {
			img = it.Spec.Template.Spec.Containers[0].Image
		}
		outList = append(outList, DeploymentInfo{
			Name:              it.Metadata.Name,
			Namespace:         it.Metadata.Namespace,
			Replicas:          rep,
			ReadyReplicas:     it.Status.ReadyReplicas,
			AvailableReplicas: it.Status.AvailableReplicas,
			Image:             img,
			CreatedAt:         it.Metadata.CreationTimestamp,
		})
	}
	return outList, nil
}

func ScaleDeployment(ctx context.Context, kubeconfig, namespace, name string, replicas int) error {
	if !ValidNamespace(namespace) || !ValidResourceName(name) {
		return errors.New("nama deployment atau namespace tidak valid")
	}
	if replicas < 0 || replicas > 100 {
		return errors.New("jumlah replika harus antara 0 sampai 100")
	}
	_, err := runKubectl(ctx, kubeconfig, nil, "scale", "deployment/"+name, "-n", namespace, "--replicas="+strconv.Itoa(replicas))
	return err
}

func RestartDeployment(ctx context.Context, kubeconfig, namespace, name string) error {
	if !ValidNamespace(namespace) || !ValidResourceName(name) {
		return errors.New("nama deployment atau namespace tidak valid")
	}
	_, err := runKubectl(ctx, kubeconfig, nil, "rollout", "restart", "deployment/"+name, "-n", namespace)
	return err
}

func ListServices(ctx context.Context, kubeconfig, namespace string) ([]ServiceInfo, error) {
	args := append([]string{"get", "services"}, nsArgs(namespace)...)
	args = append(args, "-o", "json")
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Items []struct {
			Metadata struct {
				Name              string `json:"name"`
				Namespace         string `json:"namespace"`
				CreationTimestamp string `json:"creationTimestamp"`
			} `json:"metadata"`
			Spec struct {
				Type        string   `json:"type"`
				ClusterIP   string   `json:"clusterIP"`
				ExternalIPs []string `json:"externalIPs"`
				Ports       []struct {
					Name       string `json:"name"`
					Port       int    `json:"port"`
					TargetPort any    `json:"targetPort"`
					NodePort   int    `json:"nodePort"`
					Protocol   string `json:"protocol"`
				} `json:"ports"`
			} `json:"spec"`
			Status struct {
				LoadBalancer struct {
					Ingress []struct {
						IP       string `json:"ip"`
						Hostname string `json:"hostname"`
					} `json:"ingress"`
				} `json:"loadBalancer"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	svcs := make([]ServiceInfo, 0, len(parsed.Items))
	for _, it := range parsed.Items {
		ports := make([]ServicePort, 0, len(it.Spec.Ports))
		for _, p := range it.Spec.Ports {
			ports = append(ports, ServicePort{
				Name:       p.Name,
				Port:       p.Port,
				TargetPort: fmt.Sprint(p.TargetPort),
				NodePort:   p.NodePort,
				Protocol:   p.Protocol,
			})
		}
		extIP := strings.Join(it.Spec.ExternalIPs, ", ")
		if extIP == "" && len(it.Status.LoadBalancer.Ingress) > 0 {
			ing := it.Status.LoadBalancer.Ingress[0]
			if ing.IP != "" {
				extIP = ing.IP
			} else {
				extIP = ing.Hostname
			}
		}
		svcs = append(svcs, ServiceInfo{
			Name:       it.Metadata.Name,
			Namespace:  it.Metadata.Namespace,
			Type:       it.Spec.Type,
			ClusterIP:  it.Spec.ClusterIP,
			ExternalIP: extIP,
			Ports:      ports,
			CreatedAt:  it.Metadata.CreationTimestamp,
		})
	}
	return svcs, nil
}

func ListIngresses(ctx context.Context, kubeconfig, namespace string) ([]IngressInfo, error) {
	args := append([]string{"get", "ingresses"}, nsArgs(namespace)...)
	args = append(args, "-o", "json")
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Items []struct {
			Metadata struct {
				Name              string `json:"name"`
				Namespace         string `json:"namespace"`
				CreationTimestamp string `json:"creationTimestamp"`
			} `json:"metadata"`
			Spec struct {
				IngressClassName string `json:"ingressClassName"`
				Rules            []struct {
					Host string `json:"host"`
				} `json:"rules"`
			} `json:"spec"`
		} `json:"items"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, err
	}
	outList := make([]IngressInfo, 0, len(parsed.Items))
	for _, it := range parsed.Items {
		hosts := make([]string, 0, len(it.Spec.Rules))
		for _, r := range it.Spec.Rules {
			if r.Host != "" {
				hosts = append(hosts, r.Host)
			}
		}
		outList = append(outList, IngressInfo{
			Name:      it.Metadata.Name,
			Namespace: it.Metadata.Namespace,
			ClassName: it.Spec.IngressClassName,
			Hosts:     hosts,
			CreatedAt: it.Metadata.CreationTimestamp,
		})
	}
	return outList, nil
}

func ListConfigs(ctx context.Context, kubeconfig, namespace string) ([]ConfigResource, error) {
	result := make([]ConfigResource, 0)
	for _, kind := range []struct {
		arg   string
		label string
	}{
		{"configmaps", "ConfigMap"},
		{"secrets", "Secret"},
	} {
		args := append([]string{"get", kind.arg}, nsArgs(namespace)...)
		args = append(args, "-o", "json")
		out, err := runKubectl(ctx, kubeconfig, nil, args...)
		if err != nil {
			return nil, err
		}
		var parsed struct {
			Items []struct {
				Metadata struct {
					Name              string `json:"name"`
					Namespace         string `json:"namespace"`
					CreationTimestamp string `json:"creationTimestamp"`
				} `json:"metadata"`
				Type string                 `json:"type"`
				Data map[string]interface{} `json:"data"`
			} `json:"items"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			return nil, err
		}
		for _, it := range parsed.Items {
			keys := make([]string, 0, len(it.Data))
			for k := range it.Data {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			result = append(result, ConfigResource{
				Kind:      kind.label,
				Name:      it.Metadata.Name,
				Namespace: it.Metadata.Namespace,
				Type:      it.Type,
				Keys:      keys,
				CreatedAt: it.Metadata.CreationTimestamp,
			})
		}
	}
	return result, nil
}

func GetResourceYAML(ctx context.Context, kubeconfig, kind, namespace, name string) (string, error) {
	normKind, ok := NormalizeKind(kind)
	if !ok {
		return "", errors.New("jenis resource Kubernetes tidak didukung")
	}
	if !ValidResourceName(name) {
		return "", errors.New("nama resource tidak valid")
	}
	args := []string{"get", normKind, name, "-o", "yaml"}
	if normKind != "node" && normKind != "namespace" {
		if !ValidNamespace(namespace) {
			return "", errors.New("namespace tidak valid")
		}
		args = append(args, "-n", namespace)
	}
	out, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func ApplyYAML(ctx context.Context, kubeconfig, namespace, yamlContent string) (string, error) {
	trimmed := strings.TrimSpace(yamlContent)
	if trimmed == "" {
		return "", errors.New("isi manifest YAML tidak boleh kosong")
	}
	args := []string{"apply", "-f", "-"}
	if ns := strings.TrimSpace(namespace); ns != "" && ns != "all" {
		if !ValidNamespace(ns) {
			return "", errors.New("namespace tidak valid")
		}
		args = append(args, "-n", ns)
	}
	out, err := runKubectl(ctx, kubeconfig, []byte(trimmed), args...)
	if err != nil {
		return string(out), err
	}
	return strings.TrimSpace(string(out)), nil
}

func DeleteResource(ctx context.Context, kubeconfig, kind, namespace, name string) error {
	normKind, ok := NormalizeKind(kind)
	if !ok || normKind == "node" {
		return errors.New("jenis resource tidak dapat dihapus dari panel")
	}
	if !ValidResourceName(name) {
		return errors.New("nama resource tidak valid")
	}
	args := []string{"delete", normKind, name}
	if normKind != "namespace" {
		if !ValidNamespace(namespace) {
			return errors.New("namespace tidak valid")
		}
		args = append(args, "-n", namespace)
	}
	_, err := runKubectl(ctx, kubeconfig, nil, args...)
	return err
}

func GetSummary(ctx context.Context, kubeconfig string) (*ClusterSummary, error) {
	nodes, err := ListNodes(ctx, kubeconfig)
	if err != nil {
		return nil, err
	}
	namespaces, _ := ListNamespaces(ctx, kubeconfig)
	pods, _ := ListPods(ctx, kubeconfig, "all")
	deploys, _ := ListDeployments(ctx, kubeconfig, "all")
	svcs, _ := ListServices(ctx, kubeconfig, "all")

	sum := &ClusterSummary{
		NodesTotal:      len(nodes),
		NamespacesTotal: len(namespaces),
		PodsTotal:       len(pods),
		Deployments:     len(deploys),
		Services:        len(svcs),
	}
	for _, n := range nodes {
		if n.Status == "Ready" {
			sum.NodesReady++
		}
		if sum.ServerVersion == "" && n.Version != "" {
			sum.ServerVersion = n.Version
		}
	}
	for _, p := range pods {
		switch p.Status {
		case "Running", "Succeeded":
			sum.PodsRunning++
		case "Pending", "ContainerCreating":
			sum.PodsPending++
		default:
			sum.PodsFailed++
		}
	}
	return sum, nil
}

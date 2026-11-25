package k8s

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

type K8sPVC struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Status       string `json:"status"`
	Volume       string `json:"volume"`
	Capacity     string `json:"capacity"`
	StorageClass string `json:"storageClass"`
	Age          string `json:"age"`
}

type K8sCronJob struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Schedule     string `json:"schedule"`
	Suspend      bool   `json:"suspend"`
	Active       int    `json:"active"`
	LastSchedule string `json:"lastSchedule"`
	Age          string `json:"age"`
}

type K8sTopItem struct {
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	CPU       string `json:"cpu"`
	Memory    string `json:"memory"`
}

type K8sStorageBatchResponse struct {
	PVCs             []K8sPVC     `json:"pvcs"`
	CronJobs         []K8sCronJob `json:"cronJobs"`
	MetricsAvailable bool         `json:"metricsAvailable"`
	NodeMetrics      []K8sTopItem `json:"nodeMetrics"`
	PodMetrics       []K8sTopItem `json:"podMetrics"`
}

type HelmRelease struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"app_version"`
}

type HelmOverview struct {
	Installed bool          `json:"installed"`
	Version   string        `json:"version,omitempty"`
	Releases  []HelmRelease `json:"releases"`
}

// ListStorageAndBatch returns PVCs, CronJobs, and optional kubectl top metrics in a single call.
func ListStorageAndBatch(ctx context.Context, kubeconfig, namespace string) (*K8sStorageBatchResponse, error) {
	nsArgs := []string{"-A"}
	if namespace != "" && namespace != "all" {
		if !ValidNamespace(namespace) {
			return nil, errors.New("nama namespace tidak valid")
		}
		nsArgs = []string{"-n", namespace}
	}

	res := &K8sStorageBatchResponse{
		PVCs:        []K8sPVC{},
		CronJobs:    []K8sCronJob{},
		NodeMetrics: []K8sTopItem{},
		PodMetrics:  []K8sTopItem{},
	}

	// PVCs
	pvcArgs := append([]string{"get", "pvc", "-o", "json"}, nsArgs...)
	if raw, err := runKubectl(ctx, kubeconfig, nil, pvcArgs...); err == nil {
		var payload struct {
			Items []struct {
				Metadata struct {
					Name              string `json:"name"`
					Namespace         string `json:"namespace"`
					CreationTimestamp string `json:"creationTimestamp"`
				} `json:"metadata"`
				Spec struct {
					VolumeName       string `json:"volumeName"`
					StorageClassName string `json:"storageClassName"`
				} `json:"spec"`
				Status struct {
					Phase    string            `json:"phase"`
					Capacity map[string]string `json:"capacity"`
				} `json:"status"`
			} `json:"items"`
		}
		if json.Unmarshal(raw, &payload) == nil {
			for _, it := range payload.Items {
				res.PVCs = append(res.PVCs, K8sPVC{
					Name:         it.Metadata.Name,
					Namespace:    it.Metadata.Namespace,
					Status:       it.Status.Phase,
					Volume:       it.Spec.VolumeName,
					Capacity:     it.Status.Capacity["storage"],
					StorageClass: it.Spec.StorageClassName,
					Age:          it.Metadata.CreationTimestamp,
				})
			}
		}
	}

	// CronJobs
	cjArgs := append([]string{"get", "cronjobs", "-o", "json"}, nsArgs...)
	if raw, err := runKubectl(ctx, kubeconfig, nil, cjArgs...); err == nil {
		var payload struct {
			Items []struct {
				Metadata struct {
					Name              string `json:"name"`
					Namespace         string `json:"namespace"`
					CreationTimestamp string `json:"creationTimestamp"`
				} `json:"metadata"`
				Spec struct {
					Schedule string `json:"schedule"`
					Suspend  bool   `json:"suspend"`
				} `json:"spec"`
				Status struct {
					Active           []any  `json:"active"`
					LastScheduleTime string `json:"lastScheduleTime"`
				} `json:"status"`
			} `json:"items"`
		}
		if json.Unmarshal(raw, &payload) == nil {
			for _, it := range payload.Items {
				res.CronJobs = append(res.CronJobs, K8sCronJob{
					Name:         it.Metadata.Name,
					Namespace:    it.Metadata.Namespace,
					Schedule:     it.Spec.Schedule,
					Suspend:      it.Spec.Suspend,
					Active:       len(it.Status.Active),
					LastSchedule: it.Status.LastScheduleTime,
					Age:          it.Metadata.CreationTimestamp,
				})
			}
		}
	}

	// Metrics (optional metrics-server)
	if raw, err := runKubectl(ctx, kubeconfig, nil, "top", "nodes", "--no-headers"); err == nil {
		res.MetricsAvailable = true
		for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
			f := strings.Fields(line)
			if len(f) >= 4 {
				res.NodeMetrics = append(res.NodeMetrics, K8sTopItem{
					Name:   f[0],
					CPU:    fmt.Sprintf("%s (%s)", f[1], f[2]),
					Memory: fmt.Sprintf("%s (%s)", f[3], func() string {
						if len(f) > 4 {
							return f[4]
						}
						return ""
					}()),
				})
			}
		}
	}
	if res.MetricsAvailable {
		topPodArgs := append([]string{"top", "pods", "--no-headers"}, nsArgs...)
		if raw, err := runKubectl(ctx, kubeconfig, nil, topPodArgs...); err == nil {
			allNS := namespace == "" || namespace == "all"
			for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
				f := strings.Fields(line)
				if allNS && len(f) >= 4 {
					res.PodMetrics = append(res.PodMetrics, K8sTopItem{
						Namespace: f[0],
						Name:      f[1],
						CPU:       f[2],
						Memory:    f[3],
					})
				} else if !allNS && len(f) >= 3 {
					res.PodMetrics = append(res.PodMetrics, K8sTopItem{
						Namespace: namespace,
						Name:      f[0],
						CPU:       f[1],
						Memory:    f[2],
					})
				}
			}
		}
	}

	return res, nil
}

// TriggerCronJob creates a one-shot Job from an existing CronJob.
func TriggerCronJob(ctx context.Context, kubeconfig, namespace, name string) (string, error) {
	if !ValidNamespace(namespace) || !ValidResourceName(name) {
		return "", errors.New("namespace atau nama CronJob tidak valid")
	}
	jobName := fmt.Sprintf("%s-manual-%d", SanitizeK8sName(name), time.Now().Unix()%100000)
	if len(jobName) > 62 {
		jobName = jobName[:62]
	}
	raw, err := runKubectl(ctx, kubeconfig, nil, "create", "job", "--from=cronjob/"+name, jobName, "-n", namespace)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

// --- Helm Manager ---

func findHelmBin() (string, error) {
	if p, err := exec.LookPath("helm"); err == nil {
		return p, nil
	}
	for _, cand := range []string{"/usr/local/bin/helm", "/usr/bin/helm"} {
		if _, err := os.Stat(cand); err == nil {
			return cand, nil
		}
	}
	return "", errors.New("helm CLI belum terpasang di host server")
}

func runHelm(ctx context.Context, kubeconfig string, args ...string) ([]byte, error) {
	bin, err := findHelmBin()
	if err != nil {
		return nil, err
	}
	var kubeFile string
	var cleanup func()
	if kubeconfig == "__k3s_local__" {
		kubeFile = K3sKubeconfigPath
	} else {
		tmp, tmpErr := os.CreateTemp("", "reneo-helm-kube-*.yaml")
		if tmpErr != nil {
			return nil, tmpErr
		}
		kubeFile = tmp.Name()
		cleanup = func() { _ = os.Remove(kubeFile) }
		_ = tmp.Chmod(0o600)
		_, _ = tmp.WriteString(kubeconfig)
		_ = tmp.Close()
	}
	if cleanup != nil {
		defer cleanup()
	}

	fullArgs := append([]string{"--kubeconfig", kubeFile}, args...)
	cmd := exec.CommandContext(ctx, bin, fullArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if msg == "" {
			msg = err.Error()
		}
		return nil, errors.New(msg)
	}
	return stdout.Bytes(), nil
}

func ListHelmOverview(ctx context.Context, kubeconfig string) (*HelmOverview, error) {
	bin, err := findHelmBin()
	if err != nil {
		return &HelmOverview{Installed: false, Releases: []HelmRelease{}}, nil
	}
	ov := &HelmOverview{Installed: true, Releases: []HelmRelease{}}
	if vOut, vErr := exec.CommandContext(ctx, bin, "version", "--short").Output(); vErr == nil {
		ov.Version = strings.TrimSpace(string(vOut))
	}
	raw, err := runHelm(ctx, kubeconfig, "list", "-A", "-o", "json")
	if err != nil {
		return ov, err
	}
	_ = json.Unmarshal(raw, &ov.Releases)
	if ov.Releases == nil {
		ov.Releases = []HelmRelease{}
	}
	return ov, nil
}

func InstallOrUpgradeHelm(ctx context.Context, kubeconfig, release, chart, repoName, repoURL, namespace, valuesYAML string) (string, error) {
	release = SanitizeK8sName(release)
	if !ValidNamespace(release) {
		return "", errors.New("nama release Helm tidak valid")
	}
	chart = strings.TrimSpace(chart)
	if chart == "" || strings.ContainsAny(chart, " \t\r\n;") {
		return "", errors.New("nama chart Helm tidak valid")
	}
	if namespace == "" {
		namespace = "default"
	}
	if !ValidNamespace(namespace) {
		return "", errors.New("namespace tidak valid")
	}
	if repoName != "" && repoURL != "" {
		if _, err := runHelm(ctx, kubeconfig, "repo", "add", strings.TrimSpace(repoName), strings.TrimSpace(repoURL), "--force-update"); err != nil {
			return "", fmt.Errorf("helm repo add gagal: %w", err)
		}
		_, _ = runHelm(ctx, kubeconfig, "repo", "update")
	}
	args := []string{"upgrade", "--install", release, chart, "--namespace", namespace, "--create-namespace"}
	if strings.TrimSpace(valuesYAML) != "" {
		tmpVal, err := os.CreateTemp("", "reneo-helm-values-*.yaml")
		if err != nil {
			return "", err
		}
		valPath := tmpVal.Name()
		defer func() { _ = os.Remove(valPath) }()
		_ = tmpVal.Chmod(0o600)
		_, _ = tmpVal.WriteString(valuesYAML)
		_ = tmpVal.Close()
		args = append(args, "-f", valPath)
	}
	raw, err := runHelm(ctx, kubeconfig, args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

func GetHelmValues(ctx context.Context, kubeconfig, namespace, release string) (string, error) {
	if !ValidNamespace(namespace) || !ValidResourceName(release) {
		return "", errors.New("namespace atau nama release tidak valid")
	}
	raw, err := runHelm(ctx, kubeconfig, "get", "values", release, "-n", namespace, "-o", "yaml")
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func RollbackHelmRelease(ctx context.Context, kubeconfig, namespace, release string) (string, error) {
	if !ValidNamespace(namespace) || !ValidResourceName(release) {
		return "", errors.New("namespace atau nama release tidak valid")
	}
	raw, err := runHelm(ctx, kubeconfig, "rollback", release, "-n", namespace)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

func UninstallHelmRelease(ctx context.Context, kubeconfig, namespace, release string) (string, error) {
	if !ValidNamespace(namespace) || !ValidResourceName(release) {
		return "", errors.New("namespace atau nama release tidak valid")
	}
	raw, err := runHelm(ctx, kubeconfig, "uninstall", release, "-n", namespace)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

// PrepareKubectlShellCommand builds a validated `kubectl exec -i` command for interactive pod shell streaming.
func PrepareKubectlShellCommand(ctx context.Context, kubeconfig, namespace, pod, container, shellBin string) (*exec.Cmd, func(), error) {
	if !ValidNamespace(namespace) || !ValidResourceName(pod) {
		return nil, nil, errors.New("namespace atau nama pod tidak valid")
	}
	if container != "" && !validContainerRe.MatchString(container) {
		return nil, nil, errors.New("nama container tidak valid")
	}
	if shellBin != "/bin/bash" && shellBin != "/bin/sh" {
		shellBin = "/bin/sh"
	}
	bin, err := findKubectlBin()
	if err != nil {
		return nil, nil, err
	}
	var kubeFile string
	cleanup := func() {}
	if kubeconfig == "__k3s_local__" {
		kubeFile = K3sKubeconfigPath
	} else {
		tmp, tmpErr := os.CreateTemp("", "reneo-kube-sh-*.yaml")
		if tmpErr != nil {
			return nil, nil, tmpErr
		}
		kubeFile = tmp.Name()
		cleanup = func() { _ = os.Remove(kubeFile) }
		_ = tmp.Chmod(0o600)
		_, _ = tmp.WriteString(kubeconfig)
		_ = tmp.Close()
	}

	args := make([]string, 0, 14)
	if strings.HasSuffix(strings.ToLower(bin), "k3s") || strings.HasSuffix(strings.ToLower(bin), "k3s.exe") {
		args = append(args, "kubectl")
	}
	args = append(args, "--kubeconfig", kubeFile, "exec", "-i", "-n", namespace, pod)
	if container != "" {
		args = append(args, "-c", container)
	}
	args = append(args, "--", shellBin)
	return exec.CommandContext(ctx, bin, args...), cleanup, nil
}

package k8s

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// ProjectDeploySpec defines the Kubernetes Deployment + Service parameters for a Reneo project or container image.
type ProjectDeploySpec struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Image       string            `json:"image"`
	Port        int               `json:"port"`
	Replicas    int               `json:"replicas"`
	ServiceType     string            `json:"serviceType"` // "NodePort" | "ClusterIP"
	NodePort        int               `json:"nodePort,omitempty"`
	ImagePullPolicy string            `json:"imagePullPolicy,omitempty"` // "IfNotPresent" | "Always" | "Never"
	Env             map[string]string `json:"env,omitempty"`
}

// ProjectDeployResult returns the applied manifest output and service ports (including NodePort for Cloudflare Tunnel).
type ProjectDeployResult struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	ServiceType string `json:"serviceType"`
	NodePort    int    `json:"nodePort"`
	Output      string `json:"output"`
	Manifest    string `json:"manifest"`
}

var slugCleanRe = regexp.MustCompile(`[^a-z0-9-]+`)

// SanitizeK8sName converts a project name into a valid RFC 1123 Kubernetes resource name.
func SanitizeK8sName(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, "_", "-")
	s = strings.ReplaceAll(s, " ", "-")
	s = slugCleanRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 52 {
		s = strings.TrimRight(s[:52], "-")
	}
	return s
}

func yamlQuote(v string) string {
	escaped := strings.ReplaceAll(v, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	escaped = strings.ReplaceAll(escaped, "\n", `\n`)
	return `"` + escaped + `"`
}

// BuildProjectManifest builds a clean Deployment + Service manifest ready for kubectl apply.
func BuildProjectManifest(spec ProjectDeploySpec) (string, string, string, error) {
	name := SanitizeK8sName(spec.Name)
	if !ValidNamespace(name) {
		return "", "", "", errors.New("nama workload tidak valid untuk Kubernetes")
	}
	ns := strings.TrimSpace(spec.Namespace)
	if ns == "" {
		ns = "default"
	}
	if !ValidNamespace(ns) {
		return "", "", "", errors.New("nama namespace tidak valid")
	}
	image := strings.TrimSpace(spec.Image)
	if image == "" || strings.ContainsAny(image, "\r\n\t ") {
		return "", "", "", errors.New("nama image container tidak valid")
	}
	port := spec.Port
	if port <= 0 || port > 65535 {
		port = 80
	}
	replicas := spec.Replicas
	if replicas <= 0 {
		replicas = 1
	}
	if replicas > 50 {
		replicas = 50
	}
	svcType := "NodePort"
	if strings.EqualFold(strings.TrimSpace(spec.ServiceType), "ClusterIP") {
		svcType = "ClusterIP"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: %s\n  namespace: %s\n  labels:\n    app.kubernetes.io/name: %s\n    app.kubernetes.io/managed-by: reneo\n", name, ns, name)
	fmt.Fprintf(&b, "spec:\n  replicas: %d\n  selector:\n    matchLabels:\n      app: %s\n", replicas, name)
	fmt.Fprintf(&b, "  template:\n    metadata:\n      labels:\n        app: %s\n    spec:\n      containers:\n        - name: %s\n          image: %s\n", name, name, yamlQuote(image))
	if pp := strings.TrimSpace(spec.ImagePullPolicy); pp == "IfNotPresent" || pp == "Always" || pp == "Never" {
		fmt.Fprintf(&b, "          imagePullPolicy: %s\n", pp)
	}
	fmt.Fprintf(&b, "          ports:\n            - containerPort: %d\n", port)
	if len(spec.Env) > 0 {
		b.WriteString("          env:\n")
		for k, v := range spec.Env {
			k = strings.TrimSpace(k)
			if k == "" || strings.ContainsAny(k, " \t\r\n:") {
				continue
			}
			fmt.Fprintf(&b, "            - name: %s\n              value: %s\n", k, yamlQuote(v))
		}
	}
	b.WriteString("---\n")
	fmt.Fprintf(&b, "apiVersion: v1\nkind: Service\nmetadata:\n  name: %s\n  namespace: %s\n  labels:\n    app.kubernetes.io/name: %s\n    app.kubernetes.io/managed-by: reneo\n", name, ns, name)
	fmt.Fprintf(&b, "spec:\n  type: %s\n  selector:\n    app: %s\n  ports:\n    - name: http\n      port: %d\n      targetPort: %d\n", svcType, name, port, port)
	if svcType == "NodePort" && spec.NodePort >= 30000 && spec.NodePort <= 32767 {
		fmt.Fprintf(&b, "      nodePort: %d\n", spec.NodePort)
	}
	return b.String(), name, ns, nil
}

// DeployProjectToCluster ensures the namespace exists, applies Deployment+Service, and reads back the assigned NodePort.
func DeployProjectToCluster(ctx context.Context, kubeconfig string, spec ProjectDeploySpec) (*ProjectDeployResult, error) {
	manifest, name, ns, err := BuildProjectManifest(spec)
	if err != nil {
		return nil, err
	}
	if ns != "default" {
		_ = CreateNamespace(ctx, kubeconfig, ns)
	}
	out, err := ApplyYAML(ctx, kubeconfig, ns, manifest)
	if err != nil {
		return nil, err
	}
	res := &ProjectDeployResult{
		Name:        name,
		Namespace:   ns,
		ServiceType: "NodePort",
		Output:      out,
		Manifest:    manifest,
	}
	if strings.EqualFold(strings.TrimSpace(spec.ServiceType), "ClusterIP") {
		res.ServiceType = "ClusterIP"
	}
	if svcs, svcErr := ListServices(ctx, kubeconfig, ns); svcErr == nil {
		for _, s := range svcs {
			if s.Name == name && len(s.Ports) > 0 {
				res.NodePort = s.Ports[0].NodePort
				break
			}
		}
	}
	return res, nil
}

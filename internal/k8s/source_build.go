package k8s

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// SourceBuildSpec configures building a Reneo project folder into a container image and deploying it to Kubernetes.
type SourceBuildSpec struct {
	ProjectName   string
	WorkingDir    string
	ProjectType   string
	SPAFallback   bool
	StartCommand  string
	Namespace     string
	Port          int
	Replicas      int
	ServiceType   string
	NodePort      int
	RegistryImage string // Optional external registry image (e.g. ghcr.io/org/app:latest); if empty, imports directly into local K3s
	Env           map[string]string
}

// GenerateDockerfile returns Dockerfile content for a project directory when none exists.
func GenerateDockerfile(workingDir, projectType string, spaFallback bool, startCommand string, port int) string {
	if port <= 0 || port > 65535 {
		port = 80
	}
	pt := strings.ToLower(strings.TrimSpace(projectType))
	if pt == "static" {
		webRoot := "."
		for _, candidate := range []string{"dist", "build", "out", "public"} {
			if info, err := os.Stat(filepath.Join(workingDir, candidate)); err == nil && info.IsDir() {
				webRoot = candidate
				break
			}
		}
		nginxTry := "try_files $uri $uri/ =404;"
		if spaFallback {
			nginxTry = "try_files $uri $uri/ /index.html;"
		}
		return fmt.Sprintf(`FROM nginx:alpine
COPY %s /usr/share/nginx/html
RUN printf 'server {\n  listen %d;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { %s }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE %d
`, webRoot, port, nginxTry, port)
	}

	// Detect Bun / pnpm / yarn / npm / Go / Python
	hasFile := func(name string) bool {
		_, err := os.Stat(filepath.Join(workingDir, name))
		return err == nil
	}

	if hasFile("go.mod") {
		return fmt.Sprintf(`FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/server /app/server
ENV PORT=%d
EXPOSE %d
CMD ["/app/server"]
`, port, port)
	}

	if hasFile("bun.lock") || hasFile("bun.lockb") {
		cmdLine := `["bun", "run", "start"]`
		if strings.TrimSpace(startCommand) != "" {
			cmdLine = fmt.Sprintf(`["sh", "-c", %q]`, strings.TrimSpace(startCommand))
		}
		return fmt.Sprintf(`FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build || true
ENV PORT=%d
EXPOSE %d
CMD %s
`, port, port, cmdLine)
	}

	if hasFile("requirements.txt") && !hasFile("package.json") {
		cmdLine := fmt.Sprintf(`["python", "-m", "http.server", "%d"]`, port)
		if strings.TrimSpace(startCommand) != "" {
			cmdLine = fmt.Sprintf(`["sh", "-c", %q]`, strings.TrimSpace(startCommand))
		}
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=%d
EXPOSE %d
CMD %s
`, port, port, cmdLine)
	}

	// Default Node.js (npm / pnpm / yarn)
	installCmd := "npm ci || npm install"
	runStart := `["npm", "start"]`
	if hasFile("pnpm-lock.yaml") {
		installCmd = "corepack enable && pnpm install --frozen-lockfile || pnpm install"
		runStart = `["pnpm", "start"]`
	} else if hasFile("yarn.lock") {
		installCmd = "corepack enable && yarn install --frozen-lockfile || yarn install"
		runStart = `["yarn", "start"]`
	}
	if strings.TrimSpace(startCommand) != "" {
		runStart = fmt.Sprintf(`["sh", "-c", %q]`, strings.TrimSpace(startCommand))
	}
	return fmt.Sprintf(`FROM node:20-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN %s
COPY . .
RUN npm run build || true
ENV PORT=%d
EXPOSE %d
CMD %s
`, installCmd, port, port, runStart)
}

// BuildAndDeployProjectSource builds a container image from a Reneo project directory,
// imports it into local K3s containerd (or pushes to an external registry), and deploys Deployment + Service.
func BuildAndDeployProjectSource(ctx context.Context, kubeconfig string, isLocalK3s bool, spec SourceBuildSpec, emit func(phase, line string)) (*ProjectDeployResult, error) {
	dir := strings.TrimSpace(spec.WorkingDir)
	if dir == "" {
		return nil, errors.New("proyek belum memiliki folder kerja (workingDir)")
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("folder proyek tidak ditemukan: %s", dir)
	}

	slug := SanitizeK8sName(spec.ProjectName)
	if !ValidNamespace(slug) {
		return nil, errors.New("nama proyek tidak valid untuk Kubernetes")
	}

	if _, err := exec.LookPath("docker"); err != nil {
		return nil, errors.New("Docker tidak ditemukan di host untuk membangun image proyek")
	}

	tag := fmt.Sprintf("%d", time.Now().Unix())
	imageRef := strings.TrimSpace(spec.RegistryImage)
	pushToRegistry := imageRef != ""
	if !pushToRegistry {
		if !isLocalK3s {
			return nil, errors.New("untuk cluster eksternal, isi nama image registry tujuan (mis. ghcr.io/org/app:latest) agar dapat di-push")
		}
		imageRef = fmt.Sprintf("docker.io/library/reneo-%s:%s", slug, tag)
	}

	port := spec.Port
	if port <= 0 || port > 65535 {
		if strings.EqualFold(spec.ProjectType, "static") {
			port = 80
		} else {
			port = 3000
		}
	}

	// 1. Prepare Dockerfile
	emit("dockerfile", fmt.Sprintf("Memeriksa Dockerfile di %s...", dir))
	dockerfilePath := filepath.Join(dir, "Dockerfile")
	var cleanupDockerfile func()
	if _, statErr := os.Stat(dockerfilePath); statErr != nil {
		tmpDF, tmpErr := os.CreateTemp("", "reneo-k8s-dockerfile-*")
		if tmpErr != nil {
			return nil, tmpErr
		}
		content := GenerateDockerfile(dir, spec.ProjectType, spec.SPAFallback, spec.StartCommand, port)
		if _, wErr := tmpDF.WriteString(content); wErr != nil {
			_ = tmpDF.Close()
			_ = os.Remove(tmpDF.Name())
			return nil, wErr
		}
		_ = tmpDF.Close()
		dockerfilePath = tmpDF.Name()
		cleanupDockerfile = func() { _ = os.Remove(dockerfilePath) }
		emit("dockerfile", fmt.Sprintf("Dockerfile dibuat otomatis untuk tipe proyek %q (port %d).", spec.ProjectType, port))
	} else {
		emit("dockerfile", "Menggunakan Dockerfile bawaan proyek.")
	}
	if cleanupDockerfile != nil {
		defer cleanupDockerfile()
	}

	// 2. Build Docker image
	emit("build", fmt.Sprintf("Membangun image %s...", imageRef))
	buildCmd := exec.CommandContext(ctx, "docker", "build", "-f", dockerfilePath, "-t", imageRef, dir)
	if err := streamCommand(buildCmd, func(l string) { emit("build", l) }); err != nil {
		return nil, fmt.Errorf("gagal membangun image Docker: %w", err)
	}

	// 3. Import into local K3s OR push to external registry
	pullPolicy := "IfNotPresent"
	if pushToRegistry {
		pullPolicy = "Always"
		emit("push", fmt.Sprintf("Mengunggah image %s ke registry...", imageRef))
		pushCmd := exec.CommandContext(ctx, "docker", "push", imageRef)
		if err := streamCommand(pushCmd, func(l string) { emit("push", l) }); err != nil {
			return nil, fmt.Errorf("gagal push image ke registry: %w", err)
		}
	} else {
		pullPolicy = "IfNotPresent"
		emit("import", "Mengimpor image ke runtime containerd K3s lokal...")
		if err := importImageToLocalK3s(ctx, imageRef, func(l string) { emit("import", l) }); err != nil {
			return nil, err
		}
	}

	// 4. Apply Deployment + Service to Kubernetes
	emit("deploy", fmt.Sprintf("Menerapkan Deployment & Service %s ke namespace %s...", slug, spec.Namespace))
	res, err := DeployProjectToCluster(ctx, kubeconfig, ProjectDeploySpec{
		Name:            slug,
		Namespace:       spec.Namespace,
		Image:           imageRef,
		Port:            port,
		Replicas:        spec.Replicas,
		ServiceType:     spec.ServiceType,
		NodePort:        spec.NodePort,
		ImagePullPolicy: pullPolicy,
		Env:             spec.Env,
	})
	if err != nil {
		return nil, err
	}
	emit("deploy", res.Output)
	return res, nil
}

func importImageToLocalK3s(ctx context.Context, imageRef string, onLine func(string)) error {
	k3sBin, err := exec.LookPath("k3s")
	if err != nil {
		return errors.New("binary k3s tidak ditemukan di host untuk mengimpor image lokal")
	}

	tmpTar, err := os.CreateTemp("", "reneo-k3s-image-*.tar")
	if err != nil {
		return err
	}
	tarPath := tmpTar.Name()
	_ = tmpTar.Close()
	defer func() { _ = os.Remove(tarPath) }()

	saveCmd := exec.CommandContext(ctx, "docker", "save", "-o", tarPath, imageRef)
	if out, saveErr := saveCmd.CombinedOutput(); saveErr != nil {
		return fmt.Errorf("gagal menyimpan arsip image Docker: %s", strings.TrimSpace(string(out)))
	}

	importCmd := exec.CommandContext(ctx, k3sBin, "ctr", "images", "import", tarPath)
	if err := streamCommand(importCmd, onLine); err != nil {
		return fmt.Errorf("gagal mengimpor image ke K3s containerd: %w", err)
	}
	return nil
}

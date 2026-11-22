package docker

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// InspectContainerConfig reads a container's runtime config and returns editable fields.
func InspectContainerConfig(id string) (*ContainerConfig, error) {
	// Use docker inspect to get JSON output
	cmd := exec.Command("docker", "inspect", id)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("inspect container %s: %s (%w)", id, strings.TrimSpace(string(out)), err)
	}

	var inspects []struct {
		Name   string `json:"Name"`
		Config struct {
			Image  string            `json:"Image"`
			Env    []string          `json:"Env"`
			Labels map[string]string `json:"Labels"`
		} `json:"Config"`
		HostConfig struct {
			PortBindings map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string `json:"HostPort"`
			} `json:"PortBindings"`
			Binds []string `json:"Binds"`
		} `json:"HostConfig"`
		Mounts []struct {
			Type        string `json:"Type"`
			Source      string `json:"Source"`
			Destination string `json:"Destination"`
			RW          bool   `json:"RW"`
		} `json:"Mounts"`
		NetworkSettings struct {
			Networks map[string]struct {
				NetworkID string `json:"NetworkID"`
				IPAddress string `json:"IPAddress"`
			} `json:"Networks"`
		} `json:"NetworkSettings"`
	}

	if err := json.Unmarshal(out, &inspects); err != nil || len(inspects) == 0 {
		return nil, fmt.Errorf("parse inspect: %w", err)
	}
	insp := inspects[0]

	// Container name (strip leading slash)
	name := strings.TrimPrefix(insp.Name, "/")

	// Primary network (skip Docker built-in networks when a user network exists).
	network := ""
	var fallbackNetwork string
	for netName := range insp.NetworkSettings.Networks {
		if fallbackNetwork == "" {
			fallbackNetwork = netName
		}
		if netName != "bridge" && netName != "host" && netName != "none" {
			network = netName
			break
		}
	}
	if network == "" {
		network = fallbackNetwork
	}

	// Parse ports: "containerPort/proto" -> []{HostIP, HostPort}
	ports := make([]PortBinding, 0)
	for spec, bindings := range insp.HostConfig.PortBindings {
		parts := strings.SplitN(spec, "/", 2)
		containerPort := parts[0]
		proto := "tcp"
		if len(parts) == 2 {
			proto = parts[1]
		}
		for _, b := range bindings {
			ports = append(ports, PortBinding{
				HostIP:        b.HostIP,
				HostPort:      b.HostPort,
				ContainerPort: containerPort,
				Protocol:      proto,
			})
		}
	}

	// Parse env vars (skip internal docker vars)
	env := make([]EnvVar, 0)
	for _, e := range insp.Config.Env {
		kv := strings.SplitN(e, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := kv[0]
		if key == "HOSTNAME" {
			continue
		}
		env = append(env, EnvVar{Key: key, Value: kv[1]})
	}

	// Parse volume binds: "hostPath:containerPath[:mode]"
	volumes := make([]VolumeBinding, 0)
	for _, bind := range insp.HostConfig.Binds {
		parts := strings.SplitN(bind, ":", 3)
		if len(parts) < 2 {
			continue
		}
		ro := len(parts) == 3 && parts[2] == "ro"
		volumes = append(volumes, VolumeBinding{
			HostPath:      parts[0],
			ContainerPath: parts[1],
			ReadOnly:      ro,
		})
	}
	if len(volumes) == 0 && len(insp.Mounts) > 0 {
		for _, m := range insp.Mounts {
			if m.Source != "" && m.Destination != "" {
				volumes = append(volumes, VolumeBinding{
					HostPath:      m.Source,
					ContainerPath: m.Destination,
					ReadOnly:      !m.RW,
				})
			}
		}
	}

	// Check if this container was created via compose
	composeFiles := []string{}
	if f := insp.Config.Labels["com.docker.compose.project.config_files"]; f != "" {
		for _, part := range strings.Split(f, ",") {
			if part = strings.TrimSpace(part); part != "" {
				composeFiles = append(composeFiles, part)
			}
		}
	}
	if len(composeFiles) == 0 {
		if dir := insp.Config.Labels["panel.compose_dir"]; dir != "" {
			composeFiles = append(composeFiles, dir)
		}
	}
	composeYaml := ""
	for _, file := range composeFiles {
		if data, err := os.ReadFile(file); err == nil && len(data) > 0 {
			composeYaml = string(data)
			break
		}
	}

	return &ContainerConfig{
		Name:        name,
		Image:       insp.Config.Image,
		Network:     network,
		Ports:       ports,
		Env:         env,
		EnvMode:     "form",
		EnvRaw:      envVarsToRaw(env),
		Volumes:     volumes,
		ComposeYaml: composeYaml,
	}, nil
}

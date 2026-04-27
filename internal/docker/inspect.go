package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// InspectContainerConfig reads a container's runtime config and returns editable fields.
func InspectContainerConfig(id string) (*ContainerConfig, error) {
	// Use docker inspect to get JSON output
	cmd := exec.Command("docker", "inspect", id)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("inspect container: %w", err)
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
	var ports []PortBinding
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
	var env []EnvVar
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
	var volumes []VolumeBinding
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

	return &ContainerConfig{
		Name:    name,
		Image:   insp.Config.Image,
		Network: network,
		Ports:   ports,
		Env:     env,
		EnvMode: "form",
		EnvRaw:  envVarsToRaw(env),
		Volumes: volumes,
	}, nil
}

package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
)

// ContainerMount is one volume, bind mount or tmpfs of a running container
type ContainerMount struct {
	ContainerID   string `json:"containerId"`
	ContainerName string `json:"containerName"`
	ProjectName   string `json:"projectName,omitempty"`
	OwnerUserID   int64  `json:"ownerUserId,omitempty"`
	OwnerName     string `json:"ownerName,omitempty"`
	// Type is bind, volume or tmpfs
	Type string `json:"type"`
	// Name is set for named volumes
	Name        string `json:"name,omitempty"`
	Source      string `json:"source,omitempty"`
	Destination string `json:"destination"`
	ReadOnly    bool   `json:"readOnly"`
	Driver      string `json:"driver,omitempty"`
}

// ListRunningMounts reads the mounts of the running containers in the list
func ListRunningMounts(containers []Container) ([]ContainerMount, error) {
	running := make([]Container, 0, len(containers))
	args := []string{"inspect", "--type", "container"}
	for _, container := range containers {
		if container.State == "running" {
			running = append(running, container)
			args = append(args, container.ID)
		}
	}
	if len(running) == 0 {
		return []ContainerMount{}, nil
	}
	out, err := exec.Command("docker", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("inspect mounts: %w", err)
	}
	return parseMounts(out, running)
}

// parseMounts turns `docker inspect` output into mounts, matching each entry to its container by id
func parseMounts(inspectJSON []byte, containers []Container) ([]ContainerMount, error) {
	var inspected []struct {
		ID     string `json:"Id"`
		Mounts []struct {
			Type        string `json:"Type"`
			Name        string `json:"Name"`
			Source      string `json:"Source"`
			Destination string `json:"Destination"`
			Driver      string `json:"Driver"`
			RW          bool   `json:"RW"`
		} `json:"Mounts"`
	}
	if err := json.Unmarshal(inspectJSON, &inspected); err != nil {
		return nil, fmt.Errorf("parse mounts: %w", err)
	}
	mounts := make([]ContainerMount, 0)
	for _, entry := range inspected {
		var owner *Container
		for i := range containers {
			if strings.HasPrefix(entry.ID, containers[i].ID) || strings.HasPrefix(containers[i].ID, entry.ID) {
				owner = &containers[i]
				break
			}
		}
		if owner == nil {
			continue
		}
		name := owner.ID
		if len(owner.Names) > 0 {
			name = strings.TrimPrefix(owner.Names[0], "/")
		}
		for _, m := range entry.Mounts {
			mounts = append(mounts, ContainerMount{
				ContainerID:   owner.ID,
				ContainerName: name,
				ProjectName:   owner.ProjectName,
				OwnerUserID:   owner.OwnerUserID,
				OwnerName:     owner.OwnerName,
				Type:          m.Type,
				Name:          m.Name,
				Source:        m.Source,
				Destination:   m.Destination,
				ReadOnly:      !m.RW,
				Driver:        m.Driver,
			})
		}
	}
	sort.Slice(mounts, func(i, j int) bool {
		if mounts[i].ContainerName != mounts[j].ContainerName {
			return strings.ToLower(mounts[i].ContainerName) < strings.ToLower(mounts[j].ContainerName)
		}
		return mounts[i].Destination < mounts[j].Destination
	})
	return mounts, nil
}

package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
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

	started := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
	defer cancel()

	if mounts, engErr := listMountsEngine(ctx, running); engErr == nil {
		performance.DefaultRegistry.RecordDockerOp("list_mounts", time.Since(started), nil)
		return mounts, nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		performance.DefaultRegistry.RecordDockerOp("list_mounts", time.Since(started), engErr)
		return nil, engErr
	}

	out, err := exec.CommandContext(ctx, "docker", args...).Output()
	if err != nil {
		err = fmt.Errorf("inspect mounts: %w", err)
		performance.DefaultRegistry.RecordDockerOp("list_mounts", time.Since(started), err)
		return nil, err
	}
	mounts, parseErr := parseMounts(out, running)
	performance.DefaultRegistry.RecordDockerOp("list_mounts", time.Since(started), parseErr)
	return mounts, parseErr
}

type inspectedMountDoc struct {
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

func listMountsEngine(ctx context.Context, running []Container) ([]ContainerMount, error) {
	// Probe first call or verify endpoint availability before spinning workers.
	if _, _, _, err := resolveEngineEndpoint(); err != nil {
		return nil, err
	}

	docs := make([]inspectedMountDoc, len(running))
	var firstErr error
	var errOnce sync.Once

	workers := inspectWorkerMax
	if len(running) < workers {
		workers = len(running)
	}
	jobs := make(chan int, len(running))
	for i := range running {
		jobs <- i
	}
	close(jobs)

	var wg sync.WaitGroup
	wg.Add(workers)
	for w := 0; w < workers; w++ {
		go func() {
			defer wg.Done()
			for idx := range jobs {
				if ctx.Err() != nil {
					return
				}
				var doc inspectedMountDoc
				path := "/containers/" + url.PathEscape(running[idx].ID) + "/json"
				if _, _, err := defaultEngine.doRequest(ctx, http.MethodGet, path, &doc); err != nil {
					if errors.Is(err, errEngineUnavailable) {
						errOnce.Do(func() { firstErr = err })
						return
					}
					continue
				}
				docs[idx] = doc
			}
		}()
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	raw, err := json.Marshal(docs)
	if err != nil {
		return nil, err
	}
	return parseMounts(raw, running)
}

// parseMounts turns `docker inspect` output into mounts, matching each entry to its container by id
func parseMounts(inspectJSON []byte, containers []Container) ([]ContainerMount, error) {
	var inspected []inspectedMountDoc
	if err := json.Unmarshal(inspectJSON, &inspected); err != nil {
		return nil, fmt.Errorf("parse mounts: %w", err)
	}
	mounts := make([]ContainerMount, 0)
	for _, entry := range inspected {
		if entry.ID == "" {
			continue
		}
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

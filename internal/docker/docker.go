package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
)

type Container struct {
	ID      string          `json:"Id"`
	Names   []string        `json:"Names"`
	Image   string          `json:"Image"`
	State   string          `json:"State"`
	Status  string          `json:"Status"`
	Ports   []ContainerPort `json:"Ports"`
	Created int64           `json:"Created"`
}

type ContainerPort struct {
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort,omitempty"`
	Type        string `json:"Type"`
}

func ListContainers() ([]Container, error) {
	cmd := exec.Command("docker", "ps", "-a", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}

	lines := splitNonEmptyLines(string(output))
	containers := make([]Container, 0, len(lines))

	for _, line := range lines {
		var row struct {
			ID      string `json:"ID"`
			Names   string `json:"Names"`
			Image   string `json:"Image"`
			State   string `json:"State"`
			Status  string `json:"Status"`
			Ports   string `json:"Ports"`
			Created int64  `json:"CreatedAt"`
		}

		if err := json.Unmarshal([]byte(line), &row); err != nil {
			return nil, fmt.Errorf("decode docker row: %w", err)
		}

		containers = append(containers, Container{
			ID:      row.ID,
			Names:   []string{"/" + row.Names},
			Image:   row.Image,
			State:   normalizeState(row.State),
			Status:  row.Status,
			Ports:   parsePorts(row.Ports),
			Created: 0,
		})
	}

	return containers, nil
}

func StartContainer(id string) error {
	cmd := exec.Command("docker", "start", id)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("start container: %s", string(output))
	}
	return nil
}

func StopContainer(id string) error {
	cmd := exec.Command("docker", "stop", id)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("stop container: %s", string(output))
	}
	return nil
}

func splitNonEmptyLines(input string) []string {
	lines := make([]string, 0)
	current := ""
	for _, r := range input {
		if r == '\n' {
			if current != "" {
				lines = append(lines, current)
				current = ""
			}
			continue
		}
		if r != '\r' {
			current += string(r)
		}
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}

func normalizeState(state string) string {
	switch state {
	case "running", "exited", "paused", "restarting", "dead":
		return state
	default:
		return "dead"
	}
}

func parsePorts(_ string) []ContainerPort {
	return []ContainerPort{}
}

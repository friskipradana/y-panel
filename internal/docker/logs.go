package docker

import (
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

func ReadContainerLogs(id string, tail int) (ContainerLogs, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return ContainerLogs{}, errors.New("container id is required")
	}
	if tail <= 0 {
		tail = 200
	}
	if tail > 1000 {
		tail = 1000
	}
	cmd := exec.Command("docker", "logs", "--tail", strconv.Itoa(tail), "--timestamps", id)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return ContainerLogs{}, fmt.Errorf("read container logs: %s", message)
	}
	return ContainerLogs{ID: id, Tail: tail, Lines: splitNonEmptyLines(string(output))}, nil
}

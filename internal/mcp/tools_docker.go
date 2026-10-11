package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

// registerDockerTools adds Docker container management tools to the server.
// If manageAllowed is false, only read-only tools (list, logs) are registered.
func registerDockerTools(s *Server, manageAllowed bool) {
	s.Register(Tool{
		Name:        "docker_list_containers",
		Description: "List all Docker containers (running and stopped) with their state, image, ports, networks, and resource info.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		containers, err := docker.ListContainers()
		if err != nil {
			return "", fmt.Errorf("list containers: %w", err)
		}
		return formatJSON(containers)
	})

	s.Register(Tool{
		Name:        "docker_container_logs",
		Description: "Fetch recent log output from a Docker container.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {
					Type:        "string",
					Description: "Container ID or name.",
				},
				"tail": {
					Type:        "integer",
					Description: "Number of log lines to return (1–1000). Defaults to 100.",
					Default:     100,
				},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := strings.TrimSpace(stringArg(args, "id", ""))
		if id == "" {
			return "", fmt.Errorf("container id is required")
		}
		tail := intArg(args, "tail", 100)
		logs, err := docker.ReadContainerLogs(id, tail)
		if err != nil {
			return "", err
		}
		if len(logs.Lines) == 0 {
			return fmt.Sprintf("No logs found for container %q.", id), nil
		}
		return fmt.Sprintf("=== Container logs: %s (last %d lines) ===\n%s", id, len(logs.Lines), strings.Join(logs.Lines, "\n")), nil
	})

	if !manageAllowed {
		return
	}

	s.Register(Tool{
		Name:        "docker_start_container",
		Description: "Start a stopped Docker container by its ID or name.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {
					Type:        "string",
					Description: "Container ID or name to start.",
				},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := strings.TrimSpace(stringArg(args, "id", ""))
		if id == "" {
			return "", fmt.Errorf("container id is required")
		}
		if err := docker.StartContainer(id); err != nil {
			return "", err
		}
		return fmt.Sprintf("Container %q started successfully.", id), nil
	})

	s.Register(Tool{
		Name:        "docker_stop_container",
		Description: "Stop a running Docker container by its ID or name.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {
					Type:        "string",
					Description: "Container ID or name to stop.",
				},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := strings.TrimSpace(stringArg(args, "id", ""))
		if id == "" {
			return "", fmt.Errorf("container id is required")
		}
		if err := docker.StopContainer(id); err != nil {
			return "", err
		}
		return fmt.Sprintf("Container %q stopped successfully.", id), nil
	})

	s.Register(Tool{
		Name:        "docker_restart_container",
		Description: "Restart a Docker container by its ID or name.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {
					Type:        "string",
					Description: "Container ID or name to restart.",
				},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := strings.TrimSpace(stringArg(args, "id", ""))
		if id == "" {
			return "", fmt.Errorf("container id is required")
		}
		if err := docker.RestartContainer(id); err != nil {
			return "", err
		}
		return fmt.Sprintf("Container %q restarted successfully.", id), nil
	})

	s.Register(Tool{
		Name:        "docker_delete_container",
		Description: "Force-remove a Docker container. Optionally remove its volumes and/or image.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {
					Type:        "string",
					Description: "Container ID or name to delete.",
				},
				"remove_volumes": {
					Type:        "boolean",
					Description: "Also remove attached volumes. Defaults to false.",
					Default:     false,
				},
				"remove_image": {
					Type:        "boolean",
					Description: "Also remove the container image if no other containers use it. Defaults to false.",
					Default:     false,
				},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := strings.TrimSpace(stringArg(args, "id", ""))
		if id == "" {
			return "", fmt.Errorf("container id is required")
		}
		removeVolumes := boolArg(args, "remove_volumes", false)
		removeImage := boolArg(args, "remove_image", false)
		if err := docker.DeleteContainer(id, removeVolumes, removeImage); err != nil {
			return "", err
		}
		return fmt.Sprintf("Container %q deleted successfully.", id), nil
	})
}

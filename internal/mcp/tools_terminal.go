package mcp

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// registerTerminalTools adds safe command execution tools.
func registerTerminalTools(s *Server) {
	s.Register(Tool{
		Name:        "terminal_exec",
		Description: "Execute a shell command on the server and return its output. Commands run as the panel-agent process user. Timeout is 60 seconds. Use with care — prefer specific tools when available.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"command": {
					Type:        "string",
					Description: "Shell command to execute (e.g. 'df -h', 'systemctl status nginx', 'ls /var/www').",
				},
				"timeout_seconds": {
					Type:        "integer",
					Description: "Command timeout in seconds (1–60). Defaults to 30.",
					Default:     30,
				},
			},
			Required: []string{"command"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		command := strings.TrimSpace(stringArg(args, "command", ""))
		if command == "" {
			return "", fmt.Errorf("command is required")
		}
		if err := validateCommand(command); err != nil {
			return "", err
		}

		timeoutSecs := intArg(args, "timeout_seconds", 30)
		if timeoutSecs <= 0 {
			timeoutSecs = 30
		}
		if timeoutSecs > 60 {
			timeoutSecs = 60
		}

		ctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSecs)*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "sh", "-c", command)
		output, err := cmd.CombinedOutput()
		text := strings.TrimSpace(string(output))

		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("command timed out after %d seconds", timeoutSecs)
		}
		if err != nil {
			if text != "" {
				return "", fmt.Errorf("command failed (exit code non-zero):\n%s", text)
			}
			return "", fmt.Errorf("command failed: %w", err)
		}
		if text == "" {
			return "(no output)", nil
		}
		return text, nil
	})
}

// validateCommand blocks obviously dangerous destructive operations.
var blockedPatterns = []string{
	"rm -rf /",
	"mkfs",
	"dd if=",
	":(){:|:&};:", // fork bomb
	"chmod -R 777 /",
	"chown -R",
}

func validateCommand(cmd string) error {
	lower := strings.ToLower(cmd)
	for _, pattern := range blockedPatterns {
		if strings.Contains(lower, strings.ToLower(pattern)) {
			return fmt.Errorf("command blocked for safety: contains %q", pattern)
		}
	}
	return nil
}

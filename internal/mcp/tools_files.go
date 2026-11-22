package mcp

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// registerFileTools adds file manager tools to the server.
// If writeAllowed is false, only read-only tools (list, read) are registered.
func registerFileTools(s *Server, writeAllowed bool) {
	s.Register(Tool{
		Name:        "file_list",
		Description: "List files and directories at the given path on the server. Returns name, type, size, and modification time.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"path": {
					Type:        "string",
					Description: "Absolute directory path to list (e.g. '/home/user', '/var/www').",
				},
			},
			Required: []string{"path"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		path := stringArg(args, "path", "")
		if path == "" {
			return "", fmt.Errorf("path is required")
		}
		if err := validatePath(path); err != nil {
			return "", err
		}
		entries, err := os.ReadDir(path)
		if err != nil {
			return "", fmt.Errorf("list directory: %w", err)
		}
		type fileEntry struct {
			Name    string `json:"name"`
			Type    string `json:"type"`
			Size    int64  `json:"size,omitempty"`
			ModTime string `json:"modTime"`
		}
		result := make([]fileEntry, 0, len(entries))
		for _, e := range entries {
			info, err := e.Info()
			if err != nil {
				continue
			}
			t := "file"
			if e.IsDir() {
				t = "directory"
			} else if info.Mode()&os.ModeSymlink != 0 {
				t = "symlink"
			}
			result = append(result, fileEntry{
				Name:    e.Name(),
				Type:    t,
				Size:    info.Size(),
				ModTime: info.ModTime().Format(time.RFC3339),
			})
		}
		sort.Slice(result, func(i, j int) bool {
			if result[i].Type != result[j].Type {
				return result[i].Type == "directory"
			}
			return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
		})
		return formatJSON(result)
	})

	s.Register(Tool{
		Name:        "file_read",
		Description: "Read the text content of a file on the server. Limited to 512 KB.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"path": {
					Type:        "string",
					Description: "Absolute file path to read.",
				},
			},
			Required: []string{"path"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		path := stringArg(args, "path", "")
		if path == "" {
			return "", fmt.Errorf("path is required")
		}
		if err := validatePath(path); err != nil {
			return "", err
		}
		info, err := os.Stat(path)
		if err != nil {
			return "", fmt.Errorf("stat file: %w", err)
		}
		if info.IsDir() {
			return "", fmt.Errorf("%q is a directory, not a file", path)
		}
		const maxSize = 512 * 1024 // 512 KB
		if info.Size() > maxSize {
			return "", fmt.Errorf("file is too large to read via MCP (%d bytes, max %d bytes)", info.Size(), maxSize)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read file: %w", err)
		}
		return string(data), nil
	})

	if !writeAllowed {
		return
	}

	s.Register(Tool{
		Name:        "file_write",
		Description: "Write or overwrite a file with the given text content. Creates parent directories if needed.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"path": {
					Type:        "string",
					Description: "Absolute file path to write.",
				},
				"content": {
					Type:        "string",
					Description: "Text content to write to the file.",
				},
			},
			Required: []string{"path", "content"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		path := stringArg(args, "path", "")
		content := stringArg(args, "content", "")
		if path == "" {
			return "", fmt.Errorf("path is required")
		}
		if err := validatePath(path); err != nil {
			return "", err
		}
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", fmt.Errorf("create parent directories: %w", err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			return "", fmt.Errorf("write file: %w", err)
		}
		return fmt.Sprintf("File %q written successfully (%d bytes).", path, len(content)), nil
	})

	s.Register(Tool{
		Name:        "file_delete",
		Description: "Delete a file or empty directory on the server.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"path": {
					Type:        "string",
					Description: "Absolute path to the file or empty directory to delete.",
				},
			},
			Required: []string{"path"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		path := stringArg(args, "path", "")
		if path == "" {
			return "", fmt.Errorf("path is required")
		}
		if err := validatePath(path); err != nil {
			return "", err
		}
		if err := os.Remove(path); err != nil {
			return "", fmt.Errorf("delete: %w", err)
		}
		return fmt.Sprintf("Deleted %q successfully.", path), nil
	})

	s.Register(Tool{
		Name:        "file_mkdir",
		Description: "Create a directory (and all parent directories) on the server.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"path": {
					Type:        "string",
					Description: "Absolute directory path to create.",
				},
			},
			Required: []string{"path"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		path := stringArg(args, "path", "")
		if path == "" {
			return "", fmt.Errorf("path is required")
		}
		if err := validatePath(path); err != nil {
			return "", err
		}
		if err := os.MkdirAll(path, 0755); err != nil {
			return "", fmt.Errorf("mkdir: %w", err)
		}
		return fmt.Sprintf("Directory %q created.", path), nil
	})
}

// validatePath blocks access to dangerous system paths.
var deniedPrefixes = []string{"/proc", "/sys", "/dev", "/boot", "/etc/shadow", "/root/.ssh"}

func validatePath(path string) error {
	clean := filepath.Clean(path)
	for _, prefix := range deniedPrefixes {
		if clean == prefix || strings.HasPrefix(clean, prefix+"/") {
			return fmt.Errorf("access to %q is not allowed", path)
		}
	}
	return nil
}

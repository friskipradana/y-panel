package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
)

type Image struct {
	ID         string `json:"Id"`
	Repository string `json:"Repository"`
	Tag        string `json:"Tag"`
	Size       string `json:"Size"`
	CreatedAt  string `json:"CreatedAt"`
}

func ListImages() ([]Image, error) {
	cmd := exec.Command("docker", "image", "ls", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("list images: %w", err)
	}

	lines := splitNonEmptyLines(string(output))
	images := make([]Image, 0, len(lines))

	for _, line := range lines {
		var row struct {
			ID         string `json:"ID"`
			Repository string `json:"Repository"`
			Tag        string `json:"Tag"`
			Size       string `json:"Size"`
			CreatedAt  string `json:"CreatedAt"`
		}

		if err := json.Unmarshal([]byte(line), &row); err != nil {
			return nil, fmt.Errorf("decode docker image row: %w", err)
		}

		images = append(images, Image{
			ID:         row.ID,
			Repository: row.Repository,
			Tag:        row.Tag,
			Size:       row.Size,
			CreatedAt:  row.CreatedAt,
		})
	}

	return images, nil
}

func RemoveImage(id string) error {
	cmd := exec.Command("docker", "rmi", "-f", id)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("remove image: %w", err)
	}
	return nil
}

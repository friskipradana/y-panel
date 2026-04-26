package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

type Image struct {
	ID           string   `json:"Id"`
	Repository   string   `json:"Repository"`
	Tag          string   `json:"Tag"`
	Size         string   `json:"Size"`
	CreatedAt    string   `json:"CreatedAt"`
	OwnerUserIDs []int64  `json:"OwnerUserIds,omitempty"`
	OwnerNames   []string `json:"OwnerNames,omitempty"`
}

func ListImages() ([]Image, error) {
	cmd := exec.Command("docker", "image", "ls", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("list images: %w", err)
	}
	ownersByImage, _ := imageOwnersByReference()

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

		image := Image{
			ID:         row.ID,
			Repository: row.Repository,
			Tag:        row.Tag,
			Size:       row.Size,
			CreatedAt:  row.CreatedAt,
		}
		applyImageOwners(&image, ownersByImage)
		images = append(images, image)
	}

	return images, nil
}

func applyImageOwners(image *Image, ownersByImage map[string]map[int64]string) {
	if image == nil || len(ownersByImage) == 0 {
		return
	}
	refs := []string{image.ID, strings.TrimPrefix(image.ID, "sha256:")}
	if image.Repository != "" && image.Repository != "<none>" {
		refs = append(refs, image.Repository)
		if image.Tag != "" && image.Tag != "<none>" {
			refs = append(refs, image.Repository+":"+image.Tag)
		}
	}
	seen := map[int64]string{}
	for _, ref := range refs {
		for ownerID, ownerName := range ownersByImage[ref] {
			seen[ownerID] = ownerName
		}
	}
	if len(seen) == 0 {
		return
	}
	ids := make([]int64, 0, len(seen))
	for ownerID := range seen {
		ids = append(ids, ownerID)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, ownerID := range ids {
		image.OwnerUserIDs = append(image.OwnerUserIDs, ownerID)
		if ownerName := strings.TrimSpace(seen[ownerID]); ownerName != "" {
			image.OwnerNames = append(image.OwnerNames, ownerName)
		}
	}
}

func imageOwnersByReference() (map[string]map[int64]string, error) {
	cmd := exec.Command("docker", "ps", "-a", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	owners := map[string]map[int64]string{}
	for _, line := range splitNonEmptyLines(string(output)) {
		var row struct {
			ID     string `json:"ID"`
			Image  string `json:"Image"`
			Labels string `json:"Labels"`
		}
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		labels := parseLabels(row.Labels)
		ownerID, _ := strconv.ParseInt(labels[labelOwnerID], 10, 64)
		if ownerID <= 0 {
			continue
		}
		ownerName := labels[labelOwnerName]
		for _, ref := range []string{row.Image, row.ID} {
			ref = strings.TrimSpace(ref)
			if ref == "" {
				continue
			}
			if owners[ref] == nil {
				owners[ref] = map[int64]string{}
			}
			owners[ref][ownerID] = ownerName
		}
	}
	return owners, nil
}

func RemoveImage(id string) error {
	cmd := exec.Command("docker", "rmi", "-f", id)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("remove image: %w", err)
	}
	return nil
}

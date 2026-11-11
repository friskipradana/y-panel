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
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
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

func formatImageSize(bytes int64) string {
	switch {
	case bytes >= 1000*1000*1000:
		return fmt.Sprintf("%.2fGB", float64(bytes)/(1000*1000*1000))
	case bytes >= 1000*1000:
		return fmt.Sprintf("%.1fMB", float64(bytes)/(1000*1000))
	case bytes >= 1000:
		return fmt.Sprintf("%.1fkB", float64(bytes)/1000)
	default:
		return fmt.Sprintf("%dB", bytes)
	}
}

func splitRepoTag(ref string) (string, string) {
	if ref == "" || ref == "<none>:<none>" {
		return "<none>", "<none>"
	}
	lastSlash := strings.LastIndex(ref, "/")
	lastColon := strings.LastIndex(ref, ":")
	if lastColon > lastSlash {
		return ref[:lastColon], ref[lastColon+1:]
	}
	return ref, "<none>"
}

func ListImages() ([]Image, error) {
	started := time.Now()
	res, err := imagesCache.Get(func() ([]Image, error) {
		ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
		defer cancel()

		ownersByImage := imageOwnersFromCachedContainers()
		if images, engErr := listImagesEngine(ctx, ownersByImage); engErr == nil {
			return images, nil
		} else if !errors.Is(engErr, errEngineUnavailable) {
			return nil, engErr
		}
		return listImagesCLI(ctx, ownersByImage)
	})
	performance.DefaultRegistry.RecordDockerOp("list_images", time.Since(started), err)
	return res, err
}

func listImagesEngine(ctx context.Context, ownersByImage map[string]map[int64]string) ([]Image, error) {
	var raw []struct {
		ID          string   `json:"Id"`
		RepoTags    []string `json:"RepoTags"`
		RepoDigests []string `json:"RepoDigests"`
		Created     int64    `json:"Created"`
		Size        int64    `json:"Size"`
	}
	if _, _, err := defaultEngine.doRequest(ctx, http.MethodGet, "/images/json", &raw); err != nil {
		return nil, err
	}

	images := make([]Image, 0, len(raw))
	for _, row := range raw {
		shortID := strings.TrimPrefix(row.ID, "sha256:")
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		createdStr := ""
		if row.Created > 0 {
			createdStr = time.Unix(row.Created, 0).UTC().Format("2006-01-02 15:04:05 -0700 MST")
		}
		tags := row.RepoTags
		if len(tags) == 0 {
			tags = []string{"<none>:<none>"}
			if len(row.RepoDigests) > 0 {
				repo, _, _ := strings.Cut(row.RepoDigests[0], "@")
				if repo != "" {
					tags = []string{repo + ":<none>"}
				}
			}
		}
		for _, rt := range tags {
			repo, tag := splitRepoTag(rt)
			image := Image{
				ID:         shortID,
				Repository: repo,
				Tag:        tag,
				Size:       formatImageSize(row.Size),
				CreatedAt:  createdStr,
			}
			applyImageOwners(&image, ownersByImage)
			images = append(images, image)
		}
	}
	return images, nil
}

func listImagesCLI(ctx context.Context, ownersByImage map[string]map[int64]string) ([]Image, error) {
	cmd := exec.CommandContext(ctx, "docker", "image", "ls", "--format", "{{json .}}")
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

func imageOwnersFromCachedContainers() map[string]map[int64]string {
	containers, ok := containersCache.Peek()
	if !ok {
		var err error
		containers, err = ListContainers()
		if err != nil {
			return nil
		}
	}
	owners := map[string]map[int64]string{}
	for _, c := range containers {
		if c.OwnerUserID <= 0 {
			continue
		}
		for _, ref := range []string{c.Image, c.ID} {
			ref = strings.TrimSpace(ref)
			if ref == "" {
				continue
			}
			if owners[ref] == nil {
				owners[ref] = map[int64]string{}
			}
			owners[ref][c.OwnerUserID] = c.OwnerName
		}
	}
	return owners
}

func RemoveImage(id string) error {
	started := time.Now()
	defer func() {
		imagesCache.Invalidate()
		notifyInvalidators()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	var err error
	if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodDelete, "/images/"+url.PathEscape(id)+"?force=true", nil); engErr == nil {
		performance.DefaultRegistry.RecordDockerOp("remove_image", time.Since(started), nil)
		return nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		err = fmt.Errorf("remove image: %w", engErr)
		performance.DefaultRegistry.RecordDockerOp("remove_image", time.Since(started), err)
		return err
	}

	cmd := exec.CommandContext(ctx, "docker", "rmi", "-f", id)
	if cliErr := cmd.Run(); cliErr != nil {
		err = fmt.Errorf("remove image: %w", cliErr)
	}
	performance.DefaultRegistry.RecordDockerOp("remove_image", time.Since(started), err)
	return err
}

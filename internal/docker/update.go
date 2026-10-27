package docker

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Updating an image or a container, with what docker prints on the way handed on line by line.

// UpdateEvent is one line of the stream the window shows: a line of the log, a step that begins, the state of a container, or the end.
type UpdateEvent struct {
	Type       string                  `json:"type"` // log | step | status | containers | done | error
	Line       string                  `json:"line,omitempty"`
	Step       string                  `json:"step,omitempty"` // pull | recreate
	Container  *UpdateContainerStatus  `json:"container,omitempty"`
	Error      string                  `json:"error,omitempty"`
	Containers []UpdateContainerStatus `json:"containers,omitempty"`
	// Changed is whether the pull brought a new image; Recreated whether the container was made again from it
	Changed   *bool `json:"changed,omitempty"`
	Recreated *bool `json:"recreated,omitempty"`
}

type UpdateContainerStatus struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Image string `json:"image"`
	State string `json:"state"`
	// Status is what docker says ("Up 3 seconds", "Exited (1) 2 seconds ago")
	Status string `json:"status"`
	// Compose says the container can be made again from the new image (it belongs to a compose project)
	Compose bool `json:"compose"`
}

// StatusOfContainer is what the window shows of a container.
func StatusOfContainer(c Container) UpdateContainerStatus {
	return UpdateContainerStatus{
		ID: c.ID, Name: strings.TrimPrefix(firstName(c), "/"), Image: c.Image, State: c.State, Status: c.Status, Compose: composeFilesOf(c) != nil,
	}
}

func firstName(c Container) string {
	if len(c.Names) > 0 {
		return c.Names[0]
	}
	return c.ID
}

// lineWriter hands each line docker prints to emit; docker rewrites progress lines with a carriage return, so that ends a line too
type lineWriter struct {
	emit func(string)
	buf  bytes.Buffer
}

func (w *lineWriter) Write(p []byte) (int, error) {
	for _, b := range p {
		if b == '\n' || b == '\r' {
			w.flush()
			continue
		}
		w.buf.WriteByte(b)
	}
	return len(p), nil
}

func (w *lineWriter) flush() {
	if line := strings.TrimSpace(w.buf.String()); line != "" {
		w.emit(line)
	}
	w.buf.Reset()
}

// runStreaming runs a command and sends what it prints, both outputs, as log lines
func runStreaming(ctx context.Context, dir string, emit func(UpdateEvent), name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	out := &lineWriter{emit: func(line string) { emit(UpdateEvent{Type: "log", Line: line}) }}
	cmd.Stdout = out
	cmd.Stderr = out
	err := cmd.Run()
	out.flush()
	return err
}

func containerImageID(ctx context.Context, id string) string {
	out, err := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.Image}}", id).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func imageID(ctx context.Context, ref string) string {
	out, err := exec.CommandContext(ctx, "docker", "image", "inspect", "-f", "{{.Id}}", ref).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// PullStreaming downloads the newest image of a reference and reports whether it differs from the one held before.
func PullStreaming(ctx context.Context, image string, auth *RegistryAuth, emit func(UpdateEvent)) (bool, error) {
	image = strings.TrimSpace(image)
	if image == "" {
		return false, errors.New("image is required")
	}
	if strings.HasPrefix(image, "sha256:") || strings.Contains(image, "@sha256:") {
		return false, errors.New("this image is fixed to a digest; there is no newer version to download")
	}
	logout, err := loginRegistryIfNeeded(auth)
	if err != nil {
		return false, err
	}
	if logout != nil {
		defer logout()
	}
	emit(UpdateEvent{Type: "step", Step: "pull"})
	before := imageID(ctx, image)
	if err := runStreaming(ctx, "", emit, "docker", "pull", image); err != nil {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		return false, fmt.Errorf("pull image: %w", err)
	}
	return before != imageID(ctx, image), nil
}

// ContainersOfImage lists the containers made from an image reference.
func ContainersOfImage(image string) ([]Container, error) {
	all, err := ListContainers()
	if err != nil {
		return nil, err
	}
	out := []Container{}
	for _, c := range all {
		if c.Image == image {
			out = append(out, c)
		}
	}
	return out, nil
}

// composeFilesOf are the compose files a container was made from, or nil when it was not made by compose
func composeFilesOf(c Container) []string {
	var files []string
	for _, f := range strings.Split(c.Labels["com.docker.compose.project.config_files"], ",") {
		if f = strings.TrimSpace(f); f != "" {
			files = append(files, f)
		}
	}
	if len(files) == 0 && strings.TrimSpace(c.ComposePath) != "" {
		files = []string{strings.TrimSpace(c.ComposePath)}
	}
	if len(files) == 0 || strings.TrimSpace(c.Labels["com.docker.compose.project"]) == "" || strings.TrimSpace(c.Labels["com.docker.compose.service"]) == "" {
		return nil
	}
	return files
}

func composeDirOf(c Container, files []string) string {
	if dir := strings.TrimSpace(c.Labels["com.docker.compose.project.working_dir"]); dir != "" {
		return dir
	}
	return filepath.Dir(files[0])
}

// UpdateContainer downloads the newest image of a container and, when there is one, makes the container again from it (compose
// containers only: the compose file says how it is made). The log of docker and the state of the container are sent on the way.
func UpdateContainer(ctx context.Context, id string, emit func(UpdateEvent)) error {
	all, err := ListContainers()
	if err != nil {
		return err
	}
	var target *Container
	for i := range all {
		if all[i].ID == id || strings.HasPrefix(all[i].ID, id) || strings.HasPrefix(id, all[i].ID) {
			target = &all[i]
			break
		}
	}
	if target == nil {
		return errors.New("container not found")
	}
	name := strings.TrimPrefix(firstName(*target), "/")
	emit(UpdateEvent{Type: "status", Container: ptr(StatusOfContainer(*target))})

	pulled, err := PullStreaming(ctx, target.Image, nil, emit)
	if err != nil {
		return err
	}
	// the container may run an older image than the one on the host (it was downloaded from the Images tab, or by hand)
	running := containerImageID(ctx, target.ID)
	latest := imageID(ctx, target.Image)
	changed := pulled || (running != "" && latest != "" && running != latest)
	switch {
	case pulled:
		emit(UpdateEvent{Type: "log", Line: "A newer image was downloaded."})
	case changed:
		emit(UpdateEvent{Type: "log", Line: "The container runs an older image than the one on the host."})
	default:
		emit(UpdateEvent{Type: "log", Line: "The image is already the newest one."})
	}
	recreated := false
	files := composeFilesOf(*target)
	switch {
	case !changed:
	case files == nil:
		emit(UpdateEvent{Type: "log", Line: "This container was not made by compose, so it cannot be made again here. Deploy it again to use the new image."})
	default:
		emit(UpdateEvent{Type: "step", Step: "recreate"})
		args := []string{"compose"}
		for _, f := range files {
			args = append(args, "-f", f)
		}
		args = append(args, "-p", target.Labels["com.docker.compose.project"], "up", "-d", "--no-deps", target.Labels["com.docker.compose.service"])
		if err := runStreaming(ctx, composeDirOf(*target, files), emit, "docker", args...); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("make the container again: %w", err)
		}
		recreated = true
	}

	// what it is now: a recreated container has a new id, the name stays
	if now, err := ListContainers(); err == nil {
		for _, c := range now {
			if strings.TrimPrefix(firstName(c), "/") == name {
				emit(UpdateEvent{Type: "status", Container: ptr(StatusOfContainer(c))})
				break
			}
		}
	}
	emit(UpdateEvent{Type: "done", Changed: &changed, Recreated: &recreated})
	return nil
}

// UpdateManaged does for a container the panel runs by itself (its WhatsApp runtime) what UpdateContainer does for a compose one: it
// downloads the newest image and, when the container runs an older one, calls recreate, which knows how the panel makes that container.
func UpdateManaged(ctx context.Context, name string, emit func(UpdateEvent), recreate func(context.Context) error) error {
	all, err := ListContainers()
	if err != nil {
		return err
	}
	var target *Container
	for i := range all {
		if strings.TrimPrefix(firstName(all[i]), "/") == name {
			target = &all[i]
			break
		}
	}
	if target == nil {
		return errors.New("container not found")
	}
	emit(UpdateEvent{Type: "status", Container: ptr(StatusOfContainer(*target))})

	pulled, err := PullStreaming(ctx, target.Image, nil, emit)
	if err != nil {
		return err
	}
	running := containerImageID(ctx, target.ID)
	latest := imageID(ctx, target.Image)
	changed := pulled || (running != "" && latest != "" && running != latest)
	switch {
	case pulled:
		emit(UpdateEvent{Type: "log", Line: "A newer image was downloaded."})
	case changed:
		emit(UpdateEvent{Type: "log", Line: "The container runs an older image than the one on the host."})
	default:
		emit(UpdateEvent{Type: "log", Line: "The image is already the newest one."})
	}
	recreated := false
	if changed {
		emit(UpdateEvent{Type: "step", Step: "recreate"})
		if err := recreate(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("make the container again: %w", err)
		}
		recreated = true
	}
	if now, err := ListContainers(); err == nil {
		for _, c := range now {
			if strings.TrimPrefix(firstName(c), "/") == name {
				emit(UpdateEvent{Type: "status", Container: ptr(StatusOfContainer(c))})
				break
			}
		}
	}
	emit(UpdateEvent{Type: "done", Changed: &changed, Recreated: &recreated})
	return nil
}

func ptr[T any](v T) *T { return &v }

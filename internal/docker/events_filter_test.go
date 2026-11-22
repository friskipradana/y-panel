package docker

import "testing"

func TestShouldInvalidateOnContainerEvent(t *testing.T) {
	noisy := []string{
		"exec_create: sh -c ls",
		"exec_start: /bin/sh",
		"exec_die",
		"health_status",
		"health_status: healthy",
		"attach",
		"detach",
		"top",
		"resize",
	}
	for _, action := range noisy {
		if shouldInvalidateOnContainerEvent(action) {
			t.Errorf("expected noisy action %q not to invalidate container cache", action)
		}
	}

	significant := []string{
		"",
		"start",
		"stop",
		"die",
		"kill",
		"restart",
		"create",
		"destroy",
		"rename",
		"update",
		"oom",
	}
	for _, action := range significant {
		if !shouldInvalidateOnContainerEvent(action) {
			t.Errorf("expected lifecycle action %q to invalidate container cache", action)
		}
	}
}

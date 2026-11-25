package k8s

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// K8sEvent represents a Kubernetes cluster event for diagnosing pod/node/deployment issues.
type K8sEvent struct {
	Type       string `json:"type"`
	Reason     string `json:"reason"`
	Message    string `json:"message"`
	Namespace  string `json:"namespace"`
	ObjectKind string `json:"objectKind"`
	ObjectName string `json:"objectName"`
	Count      int    `json:"count"`
	LastSeen   string `json:"lastSeen"`
}

// ListEvents returns Kubernetes events sorted by most recent first.
func ListEvents(ctx context.Context, kubeconfig, namespace string) ([]K8sEvent, error) {
	args := []string{"get", "events", "-o", "json"}
	if namespace == "" || namespace == "all" {
		args = append(args, "-A")
	} else {
		if !ValidNamespace(namespace) {
			return nil, errors.New("nama namespace tidak valid")
		}
		args = append(args, "-n", namespace)
	}
	raw, err := runKubectl(ctx, kubeconfig, nil, args...)
	if err != nil {
		return nil, err
	}
	var payload struct {
		Items []struct {
			Type           string `json:"type"`
			Reason         string `json:"reason"`
			Message        string `json:"message"`
			Count          int    `json:"count"`
			LastTimestamp  string `json:"lastTimestamp"`
			EventTime      string `json:"eventTime"`
			Metadata       struct {
				Namespace         string `json:"namespace"`
				CreationTimestamp string `json:"creationTimestamp"`
			} `json:"metadata"`
			InvolvedObject struct {
				Kind string `json:"kind"`
				Name string `json:"name"`
			} `json:"involvedObject"`
		} `json:"items"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("gagal membaca daftar event: %w", err)
	}
	out := make([]K8sEvent, 0, len(payload.Items))
	for _, it := range payload.Items {
		seen := it.LastTimestamp
		if seen == "" {
			seen = it.EventTime
		}
		if seen == "" {
			seen = it.Metadata.CreationTimestamp
		}
		cnt := it.Count
		if cnt <= 0 {
			cnt = 1
		}
		out = append(out, K8sEvent{
			Type:       it.Type,
			Reason:     it.Reason,
			Message:    it.Message,
			Namespace:  it.Metadata.Namespace,
			ObjectKind: it.InvolvedObject.Kind,
			ObjectName: it.InvolvedObject.Name,
			Count:      cnt,
			LastSeen:   seen,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].LastSeen > out[j].LastSeen
	})
	if len(out) > 200 {
		out = out[:200]
	}
	return out, nil
}

// StreamPodLogs follows `kubectl logs -f --timestamps` and delivers batched log lines via onBatch.
func StreamPodLogs(ctx context.Context, kubeconfig, namespace, pod, container string, tail int, onBatch func([]string) error) error {
	if !ValidNamespace(namespace) || !ValidResourceName(pod) {
		return errors.New("namespace atau nama pod tidak valid")
	}
	if container != "" && !validContainerRe.MatchString(container) {
		return errors.New("nama container tidak valid")
	}
	if tail <= 0 {
		tail = 200
	}
	if tail > 2000 {
		tail = 2000
	}

	bin, err := findKubectlBin()
	if err != nil {
		return err
	}

	var kubeFile string
	var cleanup func()
	if kubeconfig == "__k3s_local__" {
		if _, statErr := os.Stat(K3sKubeconfigPath); statErr != nil {
			return fmt.Errorf("berkas kubeconfig K3s lokal tidak ditemukan di %s", K3sKubeconfigPath)
		}
		kubeFile = K3sKubeconfigPath
	} else {
		tmp, tmpErr := os.CreateTemp("", "reneo-kube-log-*.yaml")
		if tmpErr != nil {
			return tmpErr
		}
		kubeFile = tmp.Name()
		cleanup = func() { _ = os.Remove(kubeFile) }
		_ = tmp.Chmod(0o600)
		if _, writeErr := tmp.WriteString(kubeconfig); writeErr != nil {
			_ = tmp.Close()
			cleanup()
			return writeErr
		}
		_ = tmp.Close()
	}
	if cleanup != nil {
		defer cleanup()
	}

	fullArgs := make([]string, 0, 12)
	if strings.HasSuffix(strings.ToLower(bin), "k3s") || strings.HasSuffix(strings.ToLower(bin), "k3s.exe") {
		fullArgs = append(fullArgs, "kubectl")
	}
	fullArgs = append(fullArgs, "--kubeconfig", kubeFile, "logs", "-f", "--timestamps", "--tail="+strconv.Itoa(tail), "-n", namespace, pod)
	if container != "" {
		fullArgs = append(fullArgs, "-c", container)
	}

	cmd := exec.CommandContext(ctx, bin, fullArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	lineCh := make(chan string, 256)
	var readWG sync.WaitGroup
	readPipe := func(r io.Reader) {
		defer readWG.Done()
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			select {
			case lineCh <- sc.Text():
			case <-ctx.Done():
				return
			}
		}
	}
	readWG.Add(2)
	go readPipe(stdout)
	go readPipe(stderr)
	go func() {
		readWG.Wait()
		close(lineCh)
	}()

	ticker := time.NewTicker(80 * time.Millisecond)
	defer ticker.Stop()

	batch := make([]string, 0, 50)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		err := onBatch(batch)
		batch = batch[:0]
		return err
	}

	var sendErr error
	for sendErr == nil {
		select {
		case <-ctx.Done():
			_ = cmd.Wait()
			return ctx.Err()
		case line, ok := <-lineCh:
			if !ok {
				sendErr = flush()
				goto done
			}
			batch = append(batch, line)
			if len(batch) >= 50 {
				sendErr = flush()
			}
		case <-ticker.C:
			sendErr = flush()
		}
	}

done:
	waitErr := cmd.Wait()
	if sendErr != nil {
		return sendErr
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return waitErr
}

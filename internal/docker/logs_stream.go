package docker

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os/exec"
	"regexp"
	"strconv"
	"sync"
	"time"
)

const (
	// the most lines asked for at the start of a stream
	MaxLogTail = 2000
	// lines are sent in batches: this often, or as soon as this many have gathered
	logBatchEvery = 100 * time.Millisecond
	logBatchLines = 500
	// a single line longer than this ends the stream
	logLineLimit = 1 << 20
)

// docker names and ids: no leading dash, so the value can never be read as an option
var logTargetPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)

// ValidLogTarget reports whether id is shaped like a container name or id
func ValidLogTarget(id string) bool {
	return logTargetPattern.MatchString(id)
}

// ClampLogTail keeps the number of starting lines inside 1..MaxLogTail (0 gives the default)
func ClampLogTail(tail int) int {
	switch {
	case tail <= 0:
		return 200
	case tail > MaxLogTail:
		return MaxLogTail
	}
	return tail
}

// StreamLogs follows a container's logs (stdout and stderr, with timestamps) and hands them to emit in
// batches until ctx ends or the container's log stream closes. emit must not keep the slice.
func StreamLogs(ctx context.Context, id string, tail int, emit func(lines []string) error) error {
	if !ValidLogTarget(id) {
		return errors.New("invalid container id")
	}
	cmd := exec.CommandContext(ctx, "docker", "logs", "--follow", "--timestamps", "--tail", strconv.Itoa(ClampLogTail(tail)), id)
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

	lines := make(chan string, 512)
	var readers sync.WaitGroup
	scan := func(r io.Reader) {
		defer readers.Done()
		scanner := bufio.NewScanner(r)
		scanner.Buffer(make([]byte, 64*1024), logLineLimit)
		for scanner.Scan() {
			select {
			case lines <- scanner.Text():
			case <-ctx.Done():
				return
			}
		}
	}
	readers.Add(2)
	go scan(stdout)
	go scan(stderr)
	go func() {
		readers.Wait()
		close(lines)
	}()

	ticker := time.NewTicker(logBatchEvery)
	defer ticker.Stop()
	batch := make([]string, 0, logBatchLines)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		err := emit(batch)
		batch = batch[:0]
		return err
	}

	for {
		select {
		case line, ok := <-lines:
			if !ok {
				if err := flush(); err != nil {
					return err
				}
				return cmd.Wait()
			}
			batch = append(batch, line)
			if len(batch) >= logBatchLines {
				if err := flush(); err != nil {
					go func() { _ = cmd.Wait() }()
					return err
				}
			}
		case <-ticker.C:
			if err := flush(); err != nil {
				go func() { _ = cmd.Wait() }()
				return err
			}
		case <-ctx.Done():
			go func() { _ = cmd.Wait() }()
			return ctx.Err()
		}
	}
}

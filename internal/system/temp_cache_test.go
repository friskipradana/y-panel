package system

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadValidCPUTempFileAndSensorCache(t *testing.T) {
	dir := t.TempDir()
	validFile := filepath.Join(dir, "temp1_input")
	if err := os.WriteFile(validFile, []byte("45250\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	val, ok, err := readValidCPUTempFile(validFile)
	if err != nil || !ok || val < 45.2 || val > 45.3 {
		t.Fatalf("expected ~45.25C, got val=%f ok=%v err=%v", val, ok, err)
	}

	outOfRange := filepath.Join(dir, "temp2_input")
	if err := os.WriteFile(outOfRange, []byte("200\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok, err := readValidCPUTempFile(outOfRange); err != nil || ok {
		t.Fatalf("expected out-of-range value to be ignored, got ok=%v err=%v", ok, err)
	}

	if _, ok, err := readValidCPUTempFile(filepath.Join(dir, "missing")); !os.IsNotExist(err) || ok {
		t.Fatalf("expected ErrNotExist for missing sensor, got ok=%v err=%v", ok, err)
	}

	_, _ = cpuTempSensorPaths(true)
	cpuTempCache.mu.Lock()
	scanned := cpuTempCache.scanned
	cpuTempCache.mu.Unlock()
	if scanned.IsZero() {
		t.Fatal("expected cpuTempSensorPaths(true) to record scan timestamp")
	}
}

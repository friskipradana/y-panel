package system

import (
	"bufio"
	"bytes"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type UsageStat struct {
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}

type Summary struct {
	Hostname           string    `json:"hostname"`
	OSName             string    `json:"osName"`
	Kernel             string    `json:"kernel"`
	UptimeSeconds      float64   `json:"uptimeSeconds"`
	CPUUsagePercent    float64   `json:"cpuUsagePercent"`
	CPUTemp            float64   `json:"cpuTemp"`
	Memory             UsageStat `json:"memory"`
	Storage            UsageStat `json:"storage"`
	DockerInstalled    bool      `json:"dockerInstalled"`
	DockerReachable    bool      `json:"dockerReachable"`
	DockerStatus       string    `json:"dockerStatus"`
	PortainerReachable bool      `json:"portainerReachable"`
	IPAddresses        []string  `json:"ipAddresses"`
}

type LogEntry struct {
	Line string `json:"line"`
}

func Inspect(portainerURL, stateDir string) Summary {
	hostname, _ := os.Hostname()
	dockerInstalled := hasCommand("docker")
	dockerReachable := dockerReachable()

	portainerReachable := false
	if strings.TrimSpace(portainerURL) != "" {
		portainerReachable = urlReachable(strings.TrimRight(portainerURL, "/") + "/api/status")
	}

	return Summary{
		Hostname:           hostname,
		OSName:             readOSName(),
		Kernel:             readKernel(),
		UptimeSeconds:      readUptimeSeconds(),
		CPUUsagePercent:    readCPUUsagePercent(),
		CPUTemp:            readCPUTemp(),
		Memory:             readMemoryUsage(),
		Storage:            readStorageUsage(stateDir),
		DockerInstalled:    dockerInstalled,
		DockerReachable:    dockerReachable,
		DockerStatus:       resolveDockerStatus(dockerInstalled, dockerReachable),
		PortainerReachable: portainerReachable,
		IPAddresses:        readIPAddresses(),
	}
}

func hasCommand(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func dockerReachable() bool {
	if !hasCommand("docker") {
		return false
	}
	cmd := exec.Command("docker", "info")
	return cmd.Run() == nil
}

func resolveDockerStatus(installed, reachable bool) string {
	switch {
	case !installed:
		return "Docker tidak terpasang"
	case !reachable:
		return "Docker terpasang tetapi daemon tidak dapat dijangkau"
	default:
		return "Docker aktif dan merespons"
	}
}

func urlReachable(url string) bool {
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 500
}

func readOSName() string {
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return runtime.GOOS
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
		}
	}
	return runtime.GOOS
}

func readKernel() string {
	out, err := exec.Command("uname", "-r").Output()
	if err != nil {
		return runtime.GOARCH
	}
	return strings.TrimSpace(string(out))
}

func readUptimeSeconds() float64 {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	parts := strings.Fields(string(data))
	if len(parts) == 0 {
		return 0
	}
	value, _ := strconv.ParseFloat(parts[0], 64)
	return value
}

func readCPUTemp() float64 {
	// 1. Scan seluruh hardware monitor (Intel/AMD/SuperIO)
	// Mencari file temp*_input di semua subfolder hwmon
	hwmons, err := filepath.Glob("/sys/class/hwmon/hwmon*/temp*_input")
	if err == nil {
		for _, path := range hwmons {
			data, err := os.ReadFile(path)
			if err == nil {
				tempStr := strings.TrimSpace(string(data))
				tempInt, err := strconv.ParseFloat(tempStr, 64)
				// Validasi: Suhu komputer biasanya antara 10C sampai 110C (10000-110000)
				if err == nil && tempInt > 5000 && tempInt < 150000 {
					return tempInt / 1000.0
				}
			}
		}
	}

	// 2. Scan thermal zones (ARM/Mobile/ACPI Generic)
	zones, err := filepath.Glob("/sys/class/thermal/thermal_zone*/temp")
	if err == nil {
		for _, path := range zones {
			data, err := os.ReadFile(path)
			if err == nil {
				tempStr := strings.TrimSpace(string(data))
				tempInt, err := strconv.ParseFloat(tempStr, 64)
				if err == nil && tempInt > 5000 && tempInt < 150000 {
					return tempInt / 1000.0
				}
			}
		}
	}

	return 0
}

func readCPUUsagePercent() float64 {
	first, err := readCPUStat()
	if err != nil {
		return 0
	}
	time.Sleep(180 * time.Millisecond)
	second, err := readCPUStat()
	if err != nil {
		return 0
	}

	idle := second.idle - first.idle
	total := second.total - first.total
	if total == 0 {
		return 0
	}
	return float64(total-idle) / float64(total) * 100
}

type cpuTimes struct {
	total uint64
	idle  uint64
}

func readCPUStat() (cpuTimes, error) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return cpuTimes{}, err
	}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			break
		}
		var total uint64
		for _, field := range fields[1:] {
			value, _ := strconv.ParseUint(field, 10, 64)
			total += value
		}
		idle, _ := strconv.ParseUint(fields[4], 10, 64)
		if len(fields) > 5 {
			iowait, _ := strconv.ParseUint(fields[5], 10, 64)
			idle += iowait
		}
		return cpuTimes{total: total, idle: idle}, nil
	}
	return cpuTimes{}, fmt.Errorf("cpu stat not found")
}

func readMemoryUsage() UsageStat {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return UsageStat{}
	}

	stats := make(map[string]uint64)
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		key := strings.TrimSuffix(parts[0], ":")
		val, _ := strconv.ParseUint(parts[1], 10, 64)
		stats[key] = val * 1024 // Convert KB to Bytes
	}

	total := stats["MemTotal"]
	free := stats["MemFree"]
	buffers := stats["Buffers"]
	cached := stats["Cached"]
	reclaimable := stats["SReclaimable"]

	// Di Linux, 'Used' yang sebenarnya (seperti di perintah free) adalah:
	// Total - Free - Buffers - Cache
	// SReclaimable juga merupakan bagian dari cache yang bisa diambil kembali
	used := total - free - buffers - cached - reclaimable

	return UsageStat{Total: total, Used: used}
}

func readStorageUsage(target string) UsageStat {
	return readStorageUsagePlatform(target)
}

func readIPAddresses() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return []string{}
	}
	result := make([]string, 0, 4)
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			result = append(result, fmt.Sprintf("%s (%s)", ip.String(), iface.Name))
		}
	}
	return result
}

func ReadServiceLogs(service string, limit int) ([]LogEntry, error) {
	service = strings.TrimSpace(service)
	if service == "" {
		service = "ui-panel"
	}
	if limit <= 0 {
		limit = 120
	}
	if limit > 400 {
		limit = 400
	}
	if !hasCommand("journalctl") {
		return nil, fmt.Errorf("journalctl tidak tersedia pada host")
	}

	cmd := exec.Command("journalctl", "-u", service, "-n", strconv.Itoa(limit), "--no-pager", "-o", "short-iso")
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr := strings.TrimSpace(string(exitErr.Stderr))
			if stderr != "" {
				return nil, fmt.Errorf(stderr)
			}
		}
		return nil, fmt.Errorf("gagal membaca log service %s", service)
	}

	lines := strings.Split(strings.ReplaceAll(string(out), "\r\n", "\n"), "\n")
	entries := make([]LogEntry, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		entries = append(entries, LogEntry{Line: line})
	}
	if len(entries) == 0 {
		entries = append(entries, LogEntry{Line: "Belum ada log yang tersedia untuk service ini."})
	}
	return entries, nil
}

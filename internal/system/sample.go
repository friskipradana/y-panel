package system

// Sample is the lightweight subset of Summary used for history recording.
// It deliberately skips docker probes, which are slow.
type Sample struct {
	CPUPercent  float64
	RAMPercent  float64
	DiskPercent float64
	CPUTemp     float64
	BytesRecv   uint64
	BytesSent   uint64
}

func percent(stat UsageStat) float64 {
	if stat.Total == 0 {
		return 0
	}
	p := float64(stat.Used) / float64(stat.Total) * 100
	if p > 100 {
		return 100
	}
	return p
}

func TakeSample(stateDir string) Sample {
	io := readNetworkIO()
	return Sample{
		CPUPercent:  readCPUUsagePercent(),
		RAMPercent:  percent(readMemoryUsage()),
		DiskPercent: percent(readStorageUsage(stateDir)),
		CPUTemp:     readCPUTemp(),
		BytesRecv:   io.BytesRecv,
		BytesSent:   io.BytesSent,
	}
}

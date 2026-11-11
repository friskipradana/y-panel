package system

// Sample is the lightweight subset of Summary used for history recording.
// It reads from the non-blocking cached collector so it never stalls the HTTP server or recorder.
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
	snap := DefaultCollector(stateDir).GetSnapshot().Summary
	return Sample{
		CPUPercent:  snap.CPUUsagePercent,
		RAMPercent:  percent(snap.Memory),
		DiskPercent: percent(snap.Storage),
		CPUTemp:     snap.CPUTemp,
		BytesRecv:   snap.NetworkIO.BytesRecv,
		BytesSent:   snap.NetworkIO.BytesSent,
	}
}

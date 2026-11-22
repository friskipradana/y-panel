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
	NetRxBps    float64
	NetTxBps    float64
	HasNetRate  bool
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
	snap := DefaultCollector(stateDir).GetSnapshot()
	sum := snap.Summary
	return Sample{
		CPUPercent:  sum.CPUUsagePercent,
		RAMPercent:  percent(sum.Memory),
		DiskPercent: percent(sum.Storage),
		CPUTemp:     sum.CPUTemp,
		BytesRecv:   sum.NetworkIO.BytesRecv,
		BytesSent:   sum.NetworkIO.BytesSent,
		NetRxBps:    snap.NetRxBps,
		NetTxBps:    snap.NetTxBps,
		HasNetRate:  snap.HasNetRate,
	}
}

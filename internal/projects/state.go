package projects

// ProcessStatus represents the in-memory lifecycle state of a supervised project process.
type ProcessStatus string

const (
	ProcessStopped  ProcessStatus = "STOPPED"
	ProcessStarting ProcessStatus = "STARTING"
	ProcessRunning  ProcessStatus = "RUNNING"
	ProcessStopping ProcessStatus = "STOPPING"
	ProcessFailed   ProcessStatus = "FAILED"
	ProcessUnknown  ProcessStatus = "UNKNOWN"
)

// PortStatus represents the observed TCP listener status of a project port.
type PortStatus string

const (
	PortUnknown PortStatus = "UNKNOWN"
	PortOpen    PortStatus = "OPEN"
	PortClosed  PortStatus = "CLOSED"
)

// HealthStatus combines desired DB status, process state, and port availability.
type HealthStatus string

const (
	HealthUnknown       HealthStatus = "UNKNOWN"
	HealthHealthy       HealthStatus = "HEALTHY"
	HealthStopped       HealthStatus = "STOPPED"
	HealthDegraded      HealthStatus = "DEGRADED"
	HealthDrift         HealthStatus = "DRIFT"
	HealthTransitioning HealthStatus = "TRANSITIONING"
)

// RuntimeSnapshot describes runtime status of a project while keeping JSON fields backward-compatible.
type RuntimeSnapshot struct {
	Known         bool          `json:"known"`
	Running       bool          `json:"running"`
	Listening     bool          `json:"listening"`
	Status        string        `json:"status"`
	Drift         bool          `json:"drift"`
	DriftReason   string        `json:"driftReason,omitempty"`
	ProcessStatus ProcessStatus `json:"processStatus,omitempty"`
	PortStatus    PortStatus    `json:"portStatus,omitempty"`
	HealthStatus  HealthStatus  `json:"healthStatus,omitempty"`
	LastProbeAt   int64         `json:"lastProbeAt,omitempty"`
}


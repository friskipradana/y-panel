package docker

const (
	labelManagedBy  = "panel.managed_by"
	labelOwnerID    = "panel.owner_id"
	labelOwnerName  = "panel.owner_username"
	labelSource     = "panel.source"
	labelComposeDir = "panel.compose_path"
)

type Container struct {
	ID           string                 `json:"Id"`
	Names        []string               `json:"Names"`
	Image        string                 `json:"Image"`
	State        string                 `json:"State"`
	Status       string                 `json:"Status"`
	Ports        []ContainerPort        `json:"Ports"`
	Networks     []string               `json:"Networks"`
	IPAddresses  []string               `json:"IpAddresses"`
	Created      int64                  `json:"Created"`
	Labels       map[string]string      `json:"Labels,omitempty"`
	ProjectName  string                 `json:"ProjectName,omitempty"`
	OwnerUserID  int64                  `json:"OwnerUserId,omitempty"`
	OwnerName    string                 `json:"OwnerName,omitempty"`
	Source       string                 `json:"Source,omitempty"`
	ComposePath  string                 `json:"ComposePath,omitempty"`
	Resources    map[string]any         `json:"Resources,omitempty"`
	RestartCount int                    `json:"RestartCount,omitempty"`
	ExitCode     int                    `json:"ExitCode,omitempty"`
	Health       string                 `json:"Health,omitempty"`
	StartedAt    string                 `json:"StartedAt,omitempty"`
	FinishedAt   string                 `json:"FinishedAt,omitempty"`
	CreatedAt    string                 `json:"CreatedAt,omitempty"`
	Metadata     map[string]interface{} `json:"Metadata,omitempty"`
}

type ContainerLogs struct {
	ID    string   `json:"id"`
	Tail  int      `json:"tail"`
	Lines []string `json:"lines"`
}

type ContainerPort struct {
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort,omitempty"`
	Type        string `json:"Type"`
}

type OwnerContext struct {
	UserID        int64
	Username      string
	DisplayName   string
	Role          string
	OSUsername    string
	HomeDir       string
	DockerRootDir string
	DiskQuotaMB   int64
	CPULimitPct   int
	MemoryLimitMB int
}

type PortBinding struct {
	HostIP        string `json:"hostIp,omitempty"`
	HostPort      string `json:"hostPort"`
	ContainerPort string `json:"containerPort"`
	Protocol      string `json:"protocol,omitempty"`
}

type EnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type VolumeBinding struct {
	HostPath      string `json:"hostPath"`
	ContainerPath string `json:"containerPath"`
	ReadOnly      bool   `json:"readOnly,omitempty"`
}

type RegistryAuth struct {
	Enabled         bool   `json:"enabled,omitempty"`
	Registry        string `json:"registry,omitempty"`
	UsernameOrEmail string `json:"usernameOrEmail,omitempty"`
	Password        string `json:"password,omitempty"`
}

type DeployImageRequest struct {
	Name         string          `json:"name"`
	Image        string          `json:"image"`
	Network      string          `json:"network,omitempty"`
	Ports        []PortBinding   `json:"ports"`
	Env          []EnvVar        `json:"env"`
	EnvMode      string          `json:"envMode,omitempty"`
	EnvRaw       string          `json:"envRaw,omitempty"`
	RegistryAuth *RegistryAuth   `json:"registryAuth,omitempty"`
	Volumes      []VolumeBinding `json:"volumes"`
}

type DeployComposeRequest struct {
	Name         string        `json:"name"`
	ComposeYAML  string        `json:"composeYaml"`
	RegistryAuth *RegistryAuth `json:"registryAuth,omitempty"`
}

type DeployResult struct {
	ProjectName string `json:"projectName"`
	ComposePath string `json:"composePath"`
	ProjectDir  string `json:"projectDir"`
}

// ContainerConfig holds the editable configuration of a deployed container.
type ContainerConfig struct {
	Name    string          `json:"name"`
	Image   string          `json:"image"`
	Network string          `json:"network"`
	Ports   []PortBinding   `json:"ports"`
	Env     []EnvVar        `json:"env"`
	EnvMode string          `json:"envMode,omitempty"`
	EnvRaw  string          `json:"envRaw,omitempty"`
	Volumes []VolumeBinding `json:"volumes"`
}

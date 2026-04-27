package docker

// Docker package is split by responsibility:
// - types.go: shared DTOs and constants
// - containers.go: list, inspect enrichment, lifecycle, delete
// - inspect.go: editable runtime config inspection
// - deploy.go: image/compose deploy orchestration and request normalization
// - compose.go: compose generation/execution and registry login helpers
// - compose_errors.go: Docker/Compose error normalization
// - logs.go: container log reading
// - images.go: image operations
// - networks.go: network operations

// config.go generates cloudflared config.yml content for a tunnel.
package cloudflare

import (
	"fmt"
	"strings"
)

// TunnelConfigOptions holds parameters for generating a cloudflared config.yml.
type TunnelConfigOptions struct {
	TunnelID    string
	CredFile    string
	MetricsPort int // default 2000
	Ingress     []IngressRule
}

// GenerateConfigYAML produces a cloudflared-compatible config.yml as a byte slice.
func GenerateConfigYAML(opts TunnelConfigOptions) []byte {
	if opts.MetricsPort == 0 {
		opts.MetricsPort = 2000
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("tunnel: %s\n", opts.TunnelID))
	sb.WriteString(fmt.Sprintf("credentials-file: %s\n", opts.CredFile))
	sb.WriteString(fmt.Sprintf("metrics: 0.0.0.0:%d\n", opts.MetricsPort))
	sb.WriteString("no-autoupdate: true\n")
	sb.WriteString("\ningress:\n")

	for _, rule := range opts.Ingress {
		if rule.Hostname != "" {
			sb.WriteString(fmt.Sprintf("  - hostname: %s\n", rule.Hostname))
		}
		sb.WriteString(fmt.Sprintf("    service: %s\n", rule.Service))
	}

	// Ensure catch-all rule exists
	hasDefault := false
	for _, rule := range opts.Ingress {
		if rule.Hostname == "" {
			hasDefault = true
			break
		}
	}
	if !hasDefault {
		sb.WriteString("  - service: http_status:404\n")
	}

	return []byte(sb.String())
}

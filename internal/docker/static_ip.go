package docker

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strings"
)

const DefaultStaticNetwork = "reneo-static"

type StaticIPSuggestion struct {
	Network string `json:"network"`
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway"`
	IP      string `json:"ip"`
}

// EnsureStaticNetwork ensures a user-defined bridge network with an explicit IPv4 subnet exists
// so containers can receive permanent static ipv4_address assignments that survive restarts/reboots.
func EnsureStaticNetwork(name string) (subnet, gateway string, err error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = DefaultStaticNetwork
	}
	if builtinNetwork(name) {
		return "", "", fmt.Errorf("jaringan bawaan %q tidak mendukung IP statis; pilih jaringan kustom atau %s", name, DefaultStaticNetwork)
	}

	nets, listErr := ListNetworks()
	usedSubnets := make([]*net.IPNet, 0, len(nets))
	if listErr == nil {
		for _, n := range nets {
			if n.Subnet != "" {
				if _, ipNet, pErr := net.ParseCIDR(n.Subnet); pErr == nil {
					usedSubnets = append(usedSubnets, ipNet)
				}
			}
			if n.Name == name {
				if strings.TrimSpace(n.Subnet) == "" {
					return "", "", fmt.Errorf("jaringan %q tidak memiliki subnet IPv4 eksplisit; buat jaringan dengan subnet atau gunakan %s", name, DefaultStaticNetwork)
				}
				return n.Subnet, n.Gateway, nil
			}
		}
	}

	// Pick a free 172.<octet>.0.0/16 subnet (starting at 172.28.0.0/16) that doesn't overlap existing Docker networks
	for octet := 28; octet <= 31; octet++ {
		candSubnet := fmt.Sprintf("172.%d.0.0/16", octet)
		candGateway := fmt.Sprintf("172.%d.0.1", octet)
		_, candNet, _ := net.ParseCIDR(candSubnet)
		if !subnetOverlapsAny(candNet, usedSubnets) {
			if cErr := CreateNetwork(name, candSubnet, candGateway); cErr != nil {
				if !strings.Contains(strings.ToLower(cErr.Error()), "already exists") {
					return "", "", cErr
				}
			}
			return candSubnet, candGateway, nil
		}
	}
	for octet := 200; octet <= 240; octet++ {
		candSubnet := fmt.Sprintf("10.%d.0.0/16", octet)
		candGateway := fmt.Sprintf("10.%d.0.1", octet)
		_, candNet, _ := net.ParseCIDR(candSubnet)
		if !subnetOverlapsAny(candNet, usedSubnets) {
			if cErr := CreateNetwork(name, candSubnet, candGateway); cErr != nil {
				if !strings.Contains(strings.ToLower(cErr.Error()), "already exists") {
					return "", "", cErr
				}
			}
			return candSubnet, candGateway, nil
		}
	}
	return "", "", errors.New("tidak menemukan subnet IPv4 bebas untuk jaringan statis")
}

func subnetOverlapsAny(cand *net.IPNet, existing []*net.IPNet) bool {
	if cand == nil {
		return false
	}
	for _, ex := range existing {
		if ex == nil {
			continue
		}
		if ex.Contains(cand.IP) || cand.Contains(ex.IP) {
			return true
		}
	}
	return false
}

// SuggestStaticIP returns the next unused IPv4 inside the target network (creating reneo-static if empty).
func SuggestStaticIP(networkName string) (*StaticIPSuggestion, error) {
	targetNet := strings.TrimSpace(networkName)
	if targetNet == "" || builtinNetwork(targetNet) {
		targetNet = DefaultStaticNetwork
	}
	subnet, gateway, err := EnsureStaticNetwork(targetNet)
	if err != nil {
		return nil, err
	}
	_, ipNet, err := net.ParseCIDR(subnet)
	if err != nil {
		return nil, fmt.Errorf("subnet tidak valid %q: %w", subnet, err)
	}
	used := usedIPsOnNetwork(targetNet)
	if gateway != "" {
		used[gateway] = true
	}

	base := ipNet.IP.To4()
	if base == nil {
		return nil, errors.New("hanya subnet IPv4 yang didukung")
	}
	baseInt := binary.BigEndian.Uint32(base)
	ones, bits := ipNet.Mask.Size()
	hostCount := uint32(1) << uint(bits-ones)
	startOffset := uint32(10)
	if hostCount <= 16 {
		startOffset = 2
	}
	for off := startOffset; off < hostCount-1 && off < startOffset+4096; off++ {
		var buf [4]byte
		binary.BigEndian.PutUint32(buf[:], baseInt+off)
		cand := net.IP(buf[:]).String()
		if !used[cand] {
			return &StaticIPSuggestion{
				Network: targetNet,
				Subnet:  subnet,
				Gateway: gateway,
				IP:      cand,
			}, nil
		}
	}
	return nil, fmt.Errorf("tidak ada IP bebas di subnet %s", subnet)
}

func usedIPsOnNetwork(networkName string) map[string]bool {
	used := map[string]bool{}
	out, err := exec.Command("docker", "network", "inspect", networkName).Output()
	if err != nil {
		return used
	}
	var parsed []struct {
		Containers map[string]struct {
			IPv4Address string `json:"IPv4Address"`
		} `json:"Containers"`
	}
	if json.Unmarshal(out, &parsed) != nil || len(parsed) == 0 {
		return used
	}
	for _, c := range parsed[0].Containers {
		ipOnly, _, _ := strings.Cut(strings.TrimSpace(c.IPv4Address), "/")
		if ipOnly != "" {
			used[ipOnly] = true
		}
	}
	return used
}

// ValidateStaticIPAssignment validates an optional static IPv4 against the chosen network.
// If staticIP is set and network is empty/bridge, it resolves to reneo-static.
func ValidateStaticIPAssignment(network, staticIP string) (resolvedNetwork, cleanIP string, err error) {
	network = strings.TrimSpace(network)
	staticIP = strings.TrimSpace(staticIP)
	if staticIP == "" {
		return network, "", nil
	}
	parsedIP := net.ParseIP(staticIP)
	if parsedIP == nil || parsedIP.To4() == nil {
		return "", "", fmt.Errorf("format Static IPv4 %q tidak valid (contoh: 172.28.0.10)", staticIP)
	}
	cleanIP = parsedIP.To4().String()

	if network == "" || network == "bridge" {
		network = DefaultStaticNetwork
	}
	if builtinNetwork(network) {
		return "", "", fmt.Errorf("Static IPv4 tidak bisa dipakai pada network bawaan %q", network)
	}
	// If the network already exists with a subnet, verify cleanIP belongs to it
	if nets, lErr := ListNetworks(); lErr == nil {
		for _, n := range nets {
			if n.Name == network && strings.TrimSpace(n.Subnet) != "" {
				if _, ipNet, pErr := net.ParseCIDR(n.Subnet); pErr == nil {
					if !ipNet.Contains(parsedIP) {
						return "", "", fmt.Errorf("Static IP %s berada di luar subnet jaringan %s (%s)", cleanIP, network, n.Subnet)
					}
				}
				break
			}
		}
	}
	return network, cleanIP, nil
}

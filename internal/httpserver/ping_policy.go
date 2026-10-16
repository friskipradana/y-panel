package httpserver

import (
	"context"
	"errors"
	"net"
	"time"
)

// Probes run from the server, so an account must not be able to use them to reach the machine's
// own network. The superadmin may probe anything; everyone else reaches public addresses only, and
// the probe goes to the address that was checked (a DNS answer cannot change between check and use).

var nonPublicNets = func() []*net.IPNet {
	var nets []*net.IPNet
	for _, cidr := range []string{
		"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15",
		"198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "64:ff9b::/96", "2001:db8::/32",
	} {
		if _, n, err := net.ParseCIDR(cidr); err == nil {
			nets = append(nets, n)
		}
	}
	return nets
}()

func isPublicIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsMulticast() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() {
		return false
	}
	for _, n := range nonPublicNets {
		if n.Contains(ip) {
			return false
		}
	}
	return true
}

// pingTarget returns the address to probe for host.
func pingTarget(ctx context.Context, host string, superadmin bool) (string, error) {
	if superadmin {
		return host, nil
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return "", errors.New("hanya alamat publik yang dapat diperiksa dari akun ini")
		}
		return ip.String(), nil
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIP(lookupCtx, "ip", host)
	if err != nil || len(ips) == 0 {
		return "", errors.New("host tidak dapat di-resolve")
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return "", errors.New("hanya alamat publik yang dapat diperiksa dari akun ini")
		}
	}
	return ips[0].String(), nil
}

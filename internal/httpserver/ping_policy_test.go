package httpserver

import (
	"net"
	"testing"
)

func TestIsPublicIP(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.1.1", "::1", "fe80::1", "fc00::1", "0.0.0.0"} {
		if isPublicIP(net.ParseIP(ip)) {
			t.Errorf("%s must not be public", ip)
		}
	}
	for _, ip := range []string{"1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"} {
		if !isPublicIP(net.ParseIP(ip)) {
			t.Errorf("%s should be public", ip)
		}
	}
}

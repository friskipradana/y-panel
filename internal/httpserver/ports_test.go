package httpserver

import (
	"net"
	"testing"
)

func TestPortClaimsRefuseWhatIsHeldOrListening(t *testing.T) {
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Skip("cannot listen here")
	}
	defer ln.Close()
	busy := ln.Addr().(*net.TCPAddr).Port

	claims := &portClaims{held: map[portKey]string{{port: 45123, proto: "tcp"}: `project "shop"`}, ignored: map[portKey]bool{}}
	if !isPortConflict(claims.check(45123, "tcp")) {
		t.Error("a port a project holds must be refused")
	}
	if claims.check(45123, "udp") != nil {
		t.Error("the same number on udp is another port")
	}
	if !isPortConflict(claims.check(busy, "tcp")) {
		t.Error("a port something listens on must be refused")
	}
	claims.ignored[portKey{port: busy, proto: "tcp"}] = true
	if claims.check(busy, "tcp") != nil {
		t.Error("a port held by the container being replaced is the request's own")
	}
	if claims.check(0, "tcp") == nil || claims.check(70000, "tcp") == nil {
		t.Error("a port outside 1-65535 must be refused")
	}
}

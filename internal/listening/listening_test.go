package listening

import "testing"

const sample = `tcp   LISTEN 0 4096   0.0.0.0:22     0.0.0.0:*  users:(("sshd",pid=812,fd=3))
tcp   LISTEN 0 4096      [::]:22        [::]:*  users:(("sshd",pid=812,fd=4))
tcp   LISTEN 0 4096 127.0.0.1:8787   0.0.0.0:*  users:(("reneo-agent",pid=901,fd=7))
tcp   LISTEN 0 4096   0.0.0.0:20001  0.0.0.0:*  users:(("docker-proxy",pid=1500,fd=4))
udp   UNCONN 0 0      0.0.0.0:68     0.0.0.0:*
tcp   LISTEN 0 4096         *:443          *:*  users:(("reneo-agent",pid=901,fd=9))
`

func TestParse(t *testing.T) {
	list := parse(sample)
	if len(list) != 5 {
		t.Fatalf("22 on IPv4 and IPv6 is one listener: got %d %+v", len(list), list)
	}
	by := map[int]Listener{}
	for _, l := range list {
		by[l.Port] = l
	}
	if l := by[22]; l.Process != "sshd" || l.Loopback || l.Proto != "tcp" {
		t.Fatalf("ssh: %+v", l)
	}
	if l := by[8787]; !l.Loopback || l.Process != "reneo-agent" {
		t.Fatalf("panel on loopback: %+v", l)
	}
	if l := by[20001]; l.Process != "docker-proxy" {
		t.Fatalf("docker proxy: %+v", l)
	}
	if l := by[68]; l.Proto != "udp" || l.Process != "" {
		t.Fatalf("udp without a process: %+v", l)
	}
	if by[443].Address != "0.0.0.0" {
		t.Fatalf("a wildcard is every address: %+v", by[443])
	}
	if list[0].Port != 22 {
		t.Fatal("ordered by port")
	}
}

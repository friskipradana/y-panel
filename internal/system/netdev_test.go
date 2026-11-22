package system

import "testing"

const sampleNetDev = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 5000 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0
  eth0:123456789 1000 0 0 0 0 0 0 987654 900 0 0 0 0 0 0
docker0: 4000 10 0 0 0 0 0 0 4000 10 0 0 0 0 0 0
veth1a2b: 3000 10 0 0 0 0 0 0 3000 10 0 0 0 0 0 0
 ens18: 1000 5 0 0 0 0 0 0 2000 5 0 0 0 0 0 0
`

func TestParseNetDevSkipsVirtualInterfaces(t *testing.T) {
	sample := sampleNetDev + "wg0: 9999 10 0 0 0 0 0 0 9999 10 0 0 0 0 0 0\n" +
		"tun0: 8888 10 0 0 0 0 0 0 8888 10 0 0 0 0 0 0\n" +
		"tailscale0: 7777 10 0 0 0 0 0 0 7777 10 0 0 0 0 0 0\n" +
		"vnet0: 6666 10 0 0 0 0 0 0 6666 10 0 0 0 0 0 0\n" +
		"lxdbr0: 5555 10 0 0 0 0 0 0 5555 10 0 0 0 0 0 0\n" +
		"venet0: 1000 5 0 0 0 0 0 0 2000 5 0 0 0 0 0 0\n"
	got := parseNetDev([]byte(sample))
	if got.BytesRecv != 123458789 || got.BytesSent != 991654 {
		t.Fatalf("got rx=%d tx=%d", got.BytesRecv, got.BytesSent)
	}
}

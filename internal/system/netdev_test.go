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
	got := parseNetDev([]byte(sampleNetDev))
	if got.BytesRecv != 123457789 || got.BytesSent != 989654 {
		t.Fatalf("got rx=%d tx=%d", got.BytesRecv, got.BytesSent)
	}
}

package docker

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestTTLCacheSingleflightAndInvalidation(t *testing.T) {
	c := newTTLCache[int](5 * time.Second)
	var calls atomic.Int32
	gate := make(chan struct{})

	var wg sync.WaitGroup
	results := make([]int, 16)
	for i := 0; i < 16; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, err := c.Get(func() (int, error) {
				n := int(calls.Add(1))
				if n == 1 {
					<-gate
				}
				return 42, nil
			})
			if err == nil {
				results[i] = v
			}
		}()
	}

	time.Sleep(25 * time.Millisecond)
	close(gate)
	wg.Wait()

	if calls.Load() != 1 {
		t.Fatalf("expected singleflight to deduplicate 16 callers into 1 fetch, got %d", calls.Load())
	}
	for i, v := range results {
		if v != 42 {
			t.Fatalf("caller %d got %d, want 42", i, v)
		}
	}

	c.Invalidate()
	v, err := c.Get(func() (int, error) {
		return int(calls.Add(1)) * 10, nil
	})
	if err != nil || v != 20 || calls.Load() != 2 {
		t.Fatalf("expected fresh fetch after invalidate, got v=%d calls=%d err=%v", v, calls.Load(), err)
	}
}

func TestEngineClientCachingAndMutationInvalidation(t *testing.T) {
	InvalidateAll()
	defer InvalidateAll()

	var listHits atomic.Int32
	var startHits atomic.Int32
	var imagesHits atomic.Int32
	var networksHits atomic.Int32
	state := "exited"
	var stateMu sync.Mutex

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/containers/json"):
			listHits.Add(1)
			stateMu.Lock()
			curState := state
			stateMu.Unlock()
			fmt.Fprintf(w, `[{"Id":"111122223333444455556666","Names":["/web-app"],"Image":"nginx:alpine","State":%q,"Status":"Up 2m","Created":1700000000,"Ports":[{"PrivatePort":80,"PublicPort":8080,"Type":"tcp"}],"Labels":{"panel.owner_id":"5","panel.owner_username":"alice","com.docker.compose.project":"shop"},"NetworkSettings":{"Networks":{"bridge":{"IPAddress":"172.17.0.2"}}}}]`, curState)
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/containers/") && strings.HasSuffix(r.URL.Path, "/json"):
			fmt.Fprint(w, `{"Id":"111122223333444455556666","RestartCount":2,"Created":"2026-01-01T00:00:00Z","State":{"Status":"running","ExitCode":0,"StartedAt":"2026-01-01T00:01:00Z","FinishedAt":"","Health":{"Status":"healthy"}},"NetworkSettings":{"Networks":{"bridge":{"IPAddress":"172.17.0.2"}}},"Mounts":[{"Type":"volume","Name":"data","Source":"/var/lib/docker/volumes/data/_data","Destination":"/data","Driver":"local","RW":true}]}`)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/start"):
			startHits.Add(1)
			stateMu.Lock()
			state = "running"
			stateMu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/images/json":
			imagesHits.Add(1)
			fmt.Fprint(w, `[{"Id":"sha256:aaaabbbbccccddddeeeeffff","RepoTags":["nginx:alpine"],"Created":1700000000,"Size":42500000}]`)
		case r.Method == http.MethodGet && r.URL.Path == "/networks":
			networksHits.Add(1)
			fmt.Fprint(w, `[{"Id":"net1111222233334444","Name":"app-net","Driver":"bridge","Scope":"local","Created":"2026-01-01T00:00:00Z","IPAM":{"Config":[{"Subnet":"172.20.0.0/16","Gateway":"172.20.0.1"}]},"Labels":{"panel.owner_id":"5"}}]`)
		case r.Method == http.MethodGet && r.URL.Path == "/volumes":
			fmt.Fprint(w, `{"Volumes":[{"Name":"v1"},{"Name":"v2"}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	t.Setenv("DOCKER_HOST", srv.URL)

	// 1. Multiple ListContainers calls collapse via cache + singleflight.
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cs, err := ListContainers()
			if err != nil || len(cs) != 1 || cs[0].Health != "healthy" || cs[0].RestartCount != 2 {
				t.Errorf("unexpected container list: err=%v cs=%+v", err, cs)
			}
		}()
	}
	wg.Wait()
	if listHits.Load() != 1 {
		t.Fatalf("expected 1 engine /containers/json call across 10 concurrent reads, got %d", listHits.Load())
	}

	// 2. ListImages reuses cached containers without extra /containers/json calls.
	imgs, err := ListImages()
	if err != nil || len(imgs) != 1 {
		t.Fatalf("ListImages err=%v imgs=%+v", err, imgs)
	}
	if imgs[0].Size != "42.5MB" || len(imgs[0].OwnerUserIDs) != 1 || imgs[0].OwnerUserIDs[0] != 5 {
		t.Fatalf("unexpected image metadata: %+v", imgs[0])
	}
	if listHits.Load() != 1 || imagesHits.Load() != 1 {
		t.Fatalf("expected listHits=1 imagesHits=1, got %d/%d", listHits.Load(), imagesHits.Load())
	}

	// 3. ListNetworks & CountVolumes hit Engine API once each.
	nets, err := ListNetworks()
	if err != nil || len(nets) != 1 || nets[0].Subnet != "172.20.0.0/16" || nets[0].OwnerUserID != 5 {
		t.Fatalf("unexpected networks: err=%v nets=%+v", err, nets)
	}
	if vc := CountVolumes(); vc != 2 {
		t.Fatalf("expected 2 volumes, got %d", vc)
	}

	// 4. StartContainer mutates via Engine API and immediately invalidates containers cache.
	if err := StartContainer("111122223333"); err != nil {
		t.Fatalf("StartContainer failed: %v", err)
	}
	if startHits.Load() != 1 {
		t.Fatalf("expected 1 start hit, got %d", startHits.Load())
	}
	csAfter, err := ListContainers()
	if err != nil || len(csAfter) != 1 || csAfter[0].State != "running" {
		t.Fatalf("expected invalidated fresh state=running after StartContainer, got %+v err=%v", csAfter, err)
	}
	if listHits.Load() != 2 {
		t.Fatalf("expected fresh engine query after mutation invalidation, listHits=%d", listHits.Load())
	}

	// 5. ListRunningMounts uses Engine socket cleanly.
	mounts, err := ListRunningMounts(csAfter)
	if err != nil || len(mounts) != 1 || mounts[0].Name != "data" {
		t.Fatalf("unexpected mounts: err=%v mounts=%+v", err, mounts)
	}
}

func BenchmarkListContainers_EngineCached(b *testing.B) {
	InvalidateAll()
	defer InvalidateAll()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/containers/json") {
			fmt.Fprint(w, `[{"Id":"1111222233334444","Names":["/bench-app"],"Image":"alpine:latest","State":"running","Status":"Up","Created":1700000000}]`)
			return
		}
		fmt.Fprint(w, `{"Id":"1111222233334444","RestartCount":0,"Created":"2026-01-01T00:00:00Z","State":{"Status":"running"}}`)
	}))
	defer srv.Close()
	b.Setenv("DOCKER_HOST", srv.URL)

	// Warm cache
	if _, err := ListContainers(); err != nil {
		b.Fatal(err)
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := ListContainers(); err != nil {
			b.Fatal(err)
		}
	}
}


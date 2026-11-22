package docker

import "testing"

func TestParseMountsMatchesContainersAndSorts(t *testing.T) {
	containers := []Container{
		{ID: "aaaaaaaaaaaa", Names: []string{"/web"}, ProjectName: "shop", OwnerUserID: 7, OwnerName: "toko", State: "running"},
		{ID: "bbbbbbbbbbbb", Names: []string{"/db"}, State: "running"},
	}
	out := []byte(`[
		{"Id":"bbbbbbbbbbbb0000000000000000000000000000000000000000000000000000","Mounts":[{"Type":"volume","Name":"pgdata","Source":"/var/lib/docker/volumes/pgdata/_data","Destination":"/var/lib/postgresql/data","Driver":"local","RW":true}]},
		{"Id":"aaaaaaaaaaaa1111111111111111111111111111111111111111111111111111","Mounts":[
			{"Type":"bind","Source":"/home/panel-toko/site","Destination":"/usr/share/nginx/html","RW":false},
			{"Type":"bind","Source":"/home/panel-toko/conf","Destination":"/etc/nginx","RW":true}]},
		{"Id":"cccccccccccc","Mounts":[{"Type":"bind","Source":"/x","Destination":"/y","RW":true}]}
	]`)
	mounts, err := parseMounts(out, containers)
	if err != nil {
		t.Fatal(err)
	}
	if len(mounts) != 3 {
		t.Fatalf("an unknown container must be skipped, got %d mounts: %+v", len(mounts), mounts)
	}
	// sorted by container name, then destination
	if mounts[0].ContainerName != "db" || mounts[1].Destination != "/etc/nginx" || mounts[2].Destination != "/usr/share/nginx/html" {
		t.Fatalf("unexpected order: %+v", mounts)
	}
	if mounts[0].Type != "volume" || mounts[0].Name != "pgdata" || mounts[0].ReadOnly {
		t.Fatalf("named volume lost its fields: %+v", mounts[0])
	}
	if !mounts[2].ReadOnly || mounts[2].ProjectName != "shop" || mounts[2].OwnerUserID != 7 {
		t.Fatalf("read-only flag or owner lost: %+v", mounts[2])
	}
}

func TestParseMountsRejectsGarbage(t *testing.T) {
	if _, err := parseMounts([]byte("nope"), nil); err == nil {
		t.Fatal("garbage must be an error")
	}
}

func TestListRunningMountsSkipsStoppedContainers(t *testing.T) {
	mounts, err := ListRunningMounts([]Container{{ID: "abc", State: "exited"}})
	if err != nil || len(mounts) != 0 {
		t.Fatalf("nothing running must give an empty list without calling docker: %v %v", mounts, err)
	}
}

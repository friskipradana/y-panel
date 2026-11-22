package docker

import "testing"

func TestLineWriterSplitsOnNewlinesAndCarriageReturns(t *testing.T) {
	var lines []string
	w := &lineWriter{emit: func(l string) { lines = append(lines, l) }}
	_, _ = w.Write([]byte("abc: Downloading  1MB\rabc: Downloading  2MB\nabc: Pull comp"))
	_, _ = w.Write([]byte("lete\n\n  \nlast"))
	w.flush()
	want := []string{"abc: Downloading  1MB", "abc: Downloading  2MB", "abc: Pull complete", "last"}
	if len(lines) != len(want) {
		t.Fatalf("got %q, want %q", lines, want)
	}
	for i := range want {
		if lines[i] != want[i] {
			t.Errorf("line %d: got %q, want %q", i, lines[i], want[i])
		}
	}
}

func TestComposeFilesOfNeedsProjectServiceAndFile(t *testing.T) {
	made := Container{Labels: map[string]string{
		"com.docker.compose.project": "shop", "com.docker.compose.service": "web",
		"com.docker.compose.project.config_files": "/srv/shop/compose.yml, /srv/shop/extra.yml",
	}}
	if files := composeFilesOf(made); len(files) != 2 || files[1] != "/srv/shop/extra.yml" {
		t.Fatalf("both compose files are found: %v", files)
	}
	if composeFilesOf(Container{Labels: map[string]string{"com.docker.compose.project": "shop"}}) != nil {
		t.Fatal("without a service or a file a container cannot be made again")
	}
	if composeFilesOf(Container{}) != nil {
		t.Fatal("a container made by hand has no compose file")
	}
	viaPanel := Container{ComposePath: "/home/u/app/docker-compose.yml", Labels: map[string]string{"com.docker.compose.project": "app", "com.docker.compose.service": "app"}}
	if files := composeFilesOf(viaPanel); len(files) != 1 {
		t.Fatalf("the compose path of the panel counts: %v", files)
	}
}

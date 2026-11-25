package hostops

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestValidateSSHPublicKeyAndParse(t *testing.T) {
	fakeBlob := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	raw := "ssh-ed25519 " + fakeBlob + " operator@reneo"
	norm, kt, fp, comment, id, err := ValidateSSHPublicKey(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if kt != "ssh-ed25519" || comment != "operator@reneo" || !strings.HasPrefix(fp, "SHA256:") || len(id) != 16 {
		t.Fatalf("unexpected parsed key: norm=%q kt=%q fp=%q comment=%q id=%q", norm, kt, fp, comment, id)
	}
	if _, _, _, _, _, err := ValidateSSHPublicKey("ssh-ed25519 bad\nkey"); err == nil {
		t.Fatal("expected newline injection to be rejected")
	}

	parsed := ParseAuthorizedKeys("# header\n" + raw + "\n")
	if len(parsed) != 1 || parsed[0].ID != id {
		t.Fatalf("unexpected ParseAuthorizedKeys output: %+v", parsed)
	}
}

func TestParseFail2BanOutput(t *testing.T) {
	statusOut := "Status\n|- Number of jail: 2\n`- Jail list: sshd, nginx-http-auth\n"
	jails := parseFail2BanJailList(statusOut)
	if len(jails) != 2 || jails[0] != "sshd" || jails[1] != "nginx-http-auth" {
		t.Fatalf("unexpected jails: %+v", jails)
	}
	detailOut := "Status for the jail: sshd\n" +
		"|- Filter\n" +
		"|  |- Currently failed: 3\n" +
		"`- Actions\n" +
		"   |- Currently banned: 2\n" +
		"   |- Total banned: 15\n" +
		"   `- Banned IP list: 1.2.3.4 5.6.7.8\n"
	d := parseFail2BanJailDetail("sshd", detailOut)
	if d.CurrentlyFailed != 3 || d.CurrentlyBanned != 2 || d.TotalBanned != 15 || len(d.BannedIPs) != 2 {
		t.Fatalf("unexpected jail detail: %+v", d)
	}
}

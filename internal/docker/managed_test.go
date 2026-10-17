package docker

import "testing"

func TestManagedKind(t *testing.T) {
	cases := map[string]struct {
		c    Container
		want string
	}{
		"database label":     {Container{Labels: map[string]string{"reneo.kind": "database"}}, KindDatabase},
		"control label":      {Container{Labels: map[string]string{"reneo.kind": "database-control"}}, KindDatabaseControl},
		"adminer by name":    {Container{Names: []string{"/reneo-adminer"}}, KindDatabaseControl},
		"ordinary":           {Container{Names: []string{"/web"}, Labels: map[string]string{"app": "x"}}, ""},
		"similar name":       {Container{Names: []string{"/my-reneo-adminer-2"}}, ""},
		"unknown kind label": {Container{Labels: map[string]string{"reneo.kind": "other"}}, ""},
	}
	for name, tc := range cases {
		if got := ManagedKind(tc.c); got != tc.want {
			t.Errorf("%s: got %q want %q", name, got, tc.want)
		}
	}
}

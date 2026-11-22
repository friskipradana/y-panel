package userdb

import "testing"

func TestEveryEngineOffersItsDefaultVersion(t *testing.T) {
	for _, e := range Engines() {
		if len(e.Versions) == 0 {
			t.Errorf("%s has no versions", e.ID)
			continue
		}
		found := false
		for _, v := range e.Versions {
			if ValidateVersion(v) != nil {
				t.Errorf("%s offers an invalid tag %q", e.ID, v)
			}
			if v == e.DefaultVersion {
				found = true
			}
		}
		if !found {
			t.Errorf("%s default %q is not in its version list", e.ID, e.DefaultVersion)
		}
	}
}

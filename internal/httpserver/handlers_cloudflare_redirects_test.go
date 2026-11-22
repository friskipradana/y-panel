package httpserver

import "testing"

func TestBuildRedirectRule(t *testing.T) {
	rule, err := buildRedirectRule(createRedirectRuleRequest{
		Hostname:  "Install.Example.com",
		TargetURL: "https://github.com/o/r/releases/latest/download/x.run",
	})
	if err != nil {
		t.Fatal(err)
	}
	if rule.Expression != `(http.host eq "install.example.com")` {
		t.Errorf("expression = %s", rule.Expression)
	}
	from := rule.ActionParameters["from_value"].(map[string]any)
	if from["status_code"] != 302 {
		t.Errorf("default status = %v", from["status_code"])
	}

	withPath, err := buildRedirectRule(createRedirectRuleRequest{Hostname: "a.example.com", Path: "/get", TargetURL: "https://x.io/y", StatusCode: 301})
	if err != nil || withPath.Expression != `(http.host eq "a.example.com" and http.request.uri.path eq "/get")` {
		t.Errorf("path rule = %+v err=%v", withPath, err)
	}
}

func TestBuildRedirectRuleRejectsUnsafeInput(t *testing.T) {
	bad := []createRedirectRuleRequest{
		{Hostname: `a" or true or "b.com`, TargetURL: "https://x.io"},
		{Hostname: "localhost", TargetURL: "https://x.io"},
		{Hostname: "a.example.com", Path: `/x" or http.host ne "`, TargetURL: "https://x.io"},
		{Hostname: "a.example.com", TargetURL: "javascript:alert(1)"},
		{Hostname: "a.example.com", TargetURL: "https://x.io", StatusCode: 200},
	}
	for i, req := range bad {
		if _, err := buildRedirectRule(req); err == nil {
			t.Errorf("case %d: expected rejection for %+v", i, req)
		}
	}
}

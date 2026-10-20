package notify

import (
	"strings"
	"testing"
)

func TestVerifyHashBindsTheCodeToTheAccount(t *testing.T) {
	if verifyHash(1, "123456") == verifyHash(2, "123456") {
		t.Error("the same code must hash differently for two accounts")
	}
	if verifyHash(1, "123456") != verifyHash(1, "123456") {
		t.Error("the hash must be stable")
	}
	if verifyHash(1, "123456") == verifyHash(1, "654321") {
		t.Error("two codes must not share a hash")
	}
}

func TestVerifyCodeIsSixDigits(t *testing.T) {
	for i := 0; i < 50; i++ {
		code, err := newVerifyCode()
		if err != nil || len(code) != 6 || strings.Trim(code, "0123456789") != "" {
			t.Fatalf("code %q (%v) is not six digits", code, err)
		}
	}
}

func TestVerifyTextCarriesTheCodeInBothLanguages(t *testing.T) {
	for _, locale := range []string{"id", "en"} {
		text := verifyText("123456", locale)
		if !strings.Contains(text, "123456") || !strings.Contains(text, "10") {
			t.Errorf("%s text %q lacks the code or the validity", locale, text)
		}
	}
	if verifyText("123456", "id") == verifyText("123456", "en") {
		t.Error("the two languages must differ")
	}
}

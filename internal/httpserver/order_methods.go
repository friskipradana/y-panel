package httpserver

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	orderMethodMax  = 10
	orderMethodBank = "bank"
	orderMethodWall = "ewallet"
)

// orderMethod is one bank account or e-wallet a buyer can transfer to
type orderMethod struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	Account string `json:"account"`
	Holder  string `json:"holder"`
	Enabled bool   `json:"enabled"`
}

// activeOrderMethods are the ways to pay a buyer is shown. Settings from before the list had one account: it counts as a bank.
func activeOrderMethods(settings siteSettings) []orderMethod {
	if len(settings.OrderMethods) == 0 {
		if settings.OrderAccount != "" && settings.OrderHolder != "" {
			return []orderMethod{{ID: "main", Kind: orderMethodBank, Name: settings.OrderBank, Account: settings.OrderAccount, Holder: settings.OrderHolder, Enabled: true}}
		}
		return []orderMethod{}
	}
	out := []orderMethod{}
	for _, method := range settings.OrderMethods {
		if method.Enabled && method.Account != "" && method.Holder != "" {
			out = append(out, method)
		}
	}
	return out
}

// cleanOrderMethods checks the list the superadmin saved: one line per field, a known kind, no repeated account
func cleanOrderMethods(in []orderMethod) ([]orderMethod, error) {
	if len(in) > orderMethodMax {
		return nil, fmt.Errorf("at most %d banks and e-wallets can be listed", orderMethodMax)
	}
	out := make([]orderMethod, 0, len(in))
	seen := map[string]bool{}
	for _, method := range in {
		method.Name = strings.TrimSpace(method.Name)
		method.Account = strings.TrimSpace(method.Account)
		method.Holder = strings.TrimSpace(method.Holder)
		for _, text := range []string{method.Name, method.Account, method.Holder} {
			if utf8.RuneCountInString(text) > orderTextMax || strings.ContainsAny(text, "\r\n") {
				return nil, fmt.Errorf("the payment details are one line of at most %d characters each", orderTextMax)
			}
		}
		if method.Kind != orderMethodBank && method.Kind != orderMethodWall {
			return nil, errors.New("a way to pay is a bank or an e-wallet")
		}
		if method.Name == "" || method.Account == "" || method.Holder == "" {
			return nil, errors.New("every bank or e-wallet needs a name, a number and a holder")
		}
		key := strings.ToLower(method.Name + "|" + method.Account)
		if seen[key] {
			return nil, fmt.Errorf("%s %s is listed twice", method.Name, method.Account)
		}
		seen[key] = true
		if method.ID == "" {
			raw := make([]byte, 4)
			if _, err := rand.Read(raw); err != nil {
				return nil, err
			}
			method.ID = hex.EncodeToString(raw)
		}
		out = append(out, method)
	}
	return out, nil
}

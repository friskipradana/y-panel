package database

import (
	"testing"
	"time"
)

func TestAuthCacheSessionLifecycleAndCopyIsolation(t *testing.T) {
	var c authCache
	now := time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)

	u := User{ID: 7, Username: "alice", Role: "user", Status: "active"}
	c.setSession("tok-1", u, now)

	got, ok := c.getSession("tok-1", now.Add(sessionCacheTTL-time.Millisecond))
	if !ok || got.Username != "alice" {
		t.Fatalf("expected session hit before TTL, got %+v ok=%v", got, ok)
	}
	// Mutating returned pointer must not affect cached value
	got.Username = "mutated"
	got2, ok := c.getSession("tok-1", now.Add(time.Second))
	if !ok || got2.Username != "alice" {
		t.Fatalf("expected isolated copy in cache, got %+v", got2)
	}

	// Slide throttle triggers once per sessionSlideInterval
	if !c.shouldSlideSession("tok-1", 7, now) {
		t.Fatal("expected initial slide to be allowed")
	}
	if c.shouldSlideSession("tok-1", 7, now.Add(sessionSlideInterval-time.Second)) {
		t.Fatal("expected repeat slide within interval to be throttled")
	}
	if !c.shouldSlideSession("tok-1", 7, now.Add(sessionSlideInterval)) {
		t.Fatal("expected slide after interval to be allowed")
	}

	// Expiration at TTL boundary
	if _, ok := c.getSession("tok-1", now.Add(sessionCacheTTL)); ok {
		t.Fatal("expected session entry to expire at TTL")
	}

	// Session invalidation clears both cached entry and slide timestamp
	c.setSession("tok-2", u, now)
	_ = c.shouldSlideSession("tok-2", 7, now)
	c.invalidateSession("tok-2")
	if _, ok := c.getSession("tok-2", now); ok {
		t.Fatal("expected invalidated session miss")
	}
	if !c.shouldSlideSession("tok-2", 7, now.Add(time.Second)) {
		t.Fatal("expected invalidated session slide state to reset")
	}
}

func TestAuthCacheAPITokenQuotaAndUserInvalidation(t *testing.T) {
	var c authCache
	now := time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)

	u := User{ID: 42, Username: "bob", Role: "admin", Status: "active"}
	exp := now.Add(2 * time.Second)
	tok := APIToken{ID: 99, UserID: 42, Name: "cli", ExpiresAt: &exp}
	c.setAPIToken("hash-1", u, tok, now)

	if gotU, gotT, ok := c.getAPIToken("hash-1", now.Add(time.Second)); !ok || gotU.ID != 42 || gotT.ID != 99 {
		t.Fatalf("expected active API token hit, got %+v %+v ok=%v", gotU, gotT, ok)
	}
	if _, _, ok := c.getAPIToken("hash-1", exp); ok {
		t.Fatal("expected API token to miss once token.ExpiresAt is reached")
	}

	if !c.shouldTouchAPIToken(99, now) {
		t.Fatal("expected initial token touch")
	}
	if c.shouldTouchAPIToken(99, now.Add(apiTokenTouchInterval-time.Second)) {
		t.Fatal("expected token touch throttle")
	}

	c.setAPIToken("hash-2", u, APIToken{ID: 100, UserID: 42}, now)
	c.setMustChange(42, true, now)
	c.setQuota(42, UserQuota{UserID: 42, MaxProjects: 10}, now)
	c.setSession("sess-42", u, now)

	q, ok := c.getQuota(42, now.Add(time.Second))
	if !ok || q.MaxProjects != 10 {
		t.Fatalf("expected cached quota, got %+v ok=%v", q, ok)
	}
	q.MaxProjects = 999
	q2, _ := c.getQuota(42, now.Add(time.Second))
	if q2.MaxProjects != 10 {
		t.Fatalf("expected quota copy isolation, got %d", q2.MaxProjects)
	}

	c.invalidateAPITokenByID(100)
	if _, _, ok := c.getAPIToken("hash-2", now); ok {
		t.Fatal("expected token 100 to be invalidated")
	}

	c.invalidateUser(42)
	if _, ok := c.getSession("sess-42", now); ok {
		t.Fatal("expected user session to be invalidated")
	}
	if _, ok := c.getMustChange(42, now); ok {
		t.Fatal("expected mustChange entry to be invalidated")
	}
	if _, ok := c.getQuota(42, now); ok {
		t.Fatal("expected quota entry to be invalidated")
	}
}

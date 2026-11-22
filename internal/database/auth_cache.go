package database

import (
	"sync"
	"time"
)

const (
	sessionCacheTTL        = 5 * time.Second
	sessionSlideInterval   = 5 * time.Minute
	apiTokenCacheTTL       = 5 * time.Second
	apiTokenTouchInterval  = 60 * time.Second
	mustChangeCacheTTL     = 10 * time.Second
	userQuotaCacheTTL      = 10 * time.Second
	authCacheMaxEntries    = 1024
)

type sessionCacheEntry struct {
	user      User
	cachedAt  time.Time
}

type apiTokenCacheEntry struct {
	user     User
	token    APIToken
	cachedAt time.Time
}

type boolCacheEntry struct {
	value    bool
	cachedAt time.Time
}

type quotaCacheEntry struct {
	quota    UserQuota
	cachedAt time.Time
}

// authCache stores short-lived hot-path auth, session, and quota lookups so repeated
// requests do not hit PostgreSQL on every poll or static asset fetch.
// Its zero value is ready for use.
type authCache struct {
	mu             sync.Mutex
	sessions       map[string]sessionCacheEntry
	sessionSlides  map[string]time.Time
	sessionSlideTo map[string]int64
	apiTokens      map[string]apiTokenCacheEntry
	apiTouches     map[int64]time.Time
	mustChange     map[int64]boolCacheEntry
	quotas         map[int64]quotaCacheEntry
}

func (c *authCache) getSession(token string, now time.Time) (*User, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.sessions[token]
	if !ok {
		return nil, false
	}
	if now.Sub(entry.cachedAt) >= sessionCacheTTL {
		delete(c.sessions, token)
		return nil, false
	}
	u := entry.user
	return &u, true
}

func (c *authCache) setSession(token string, u User, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sessions == nil {
		c.sessions = make(map[string]sessionCacheEntry)
	}
	if len(c.sessions) >= authCacheMaxEntries {
		for k, v := range c.sessions {
			if now.Sub(v.cachedAt) >= sessionCacheTTL {
				delete(c.sessions, k)
			}
		}
		if len(c.sessions) >= authCacheMaxEntries {
			c.sessions = make(map[string]sessionCacheEntry)
		}
	}
	c.sessions[token] = sessionCacheEntry{user: u, cachedAt: now}
}

// shouldSlideSession returns true at most once per sessionSlideInterval for a given token.
func (c *authCache) shouldSlideSession(token string, userID int64, now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if last, ok := c.sessionSlides[token]; ok && now.Sub(last) < sessionSlideInterval {
		return false
	}
	if c.sessionSlides == nil {
		c.sessionSlides = make(map[string]time.Time)
		c.sessionSlideTo = make(map[string]int64)
	}
	if len(c.sessionSlides) >= authCacheMaxEntries {
		for k, ts := range c.sessionSlides {
			if now.Sub(ts) >= sessionSlideInterval {
				delete(c.sessionSlides, k)
				delete(c.sessionSlideTo, k)
			}
		}
		if len(c.sessionSlides) >= authCacheMaxEntries {
			c.sessionSlides = make(map[string]time.Time)
			c.sessionSlideTo = make(map[string]int64)
		}
	}
	c.sessionSlides[token] = now
	c.sessionSlideTo[token] = userID
	return true
}

func (c *authCache) invalidateSession(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.sessions, token)
	delete(c.sessionSlides, token)
	delete(c.sessionSlideTo, token)
}

func (c *authCache) getAPIToken(tokenHash string, now time.Time) (*User, *APIToken, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.apiTokens[tokenHash]
	if !ok {
		return nil, nil, false
	}
	if now.Sub(entry.cachedAt) >= apiTokenCacheTTL {
		delete(c.apiTokens, tokenHash)
		return nil, nil, false
	}
	if entry.token.ExpiresAt != nil && !entry.token.ExpiresAt.After(now) {
		delete(c.apiTokens, tokenHash)
		return nil, nil, false
	}
	u := entry.user
	t := entry.token
	return &u, &t, true
}

func (c *authCache) setAPIToken(tokenHash string, u User, t APIToken, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.apiTokens == nil {
		c.apiTokens = make(map[string]apiTokenCacheEntry)
	}
	if len(c.apiTokens) >= authCacheMaxEntries {
		c.apiTokens = make(map[string]apiTokenCacheEntry)
	}
	c.apiTokens[tokenHash] = apiTokenCacheEntry{user: u, token: t, cachedAt: now}
}

func (c *authCache) shouldTouchAPIToken(tokenID int64, now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if last, ok := c.apiTouches[tokenID]; ok && now.Sub(last) < apiTokenTouchInterval {
		return false
	}
	if c.apiTouches == nil {
		c.apiTouches = make(map[int64]time.Time)
	}
	if len(c.apiTouches) >= authCacheMaxEntries {
		c.apiTouches = make(map[int64]time.Time)
	}
	c.apiTouches[tokenID] = now
	return true
}

func (c *authCache) invalidateAPITokenByID(tokenID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range c.apiTokens {
		if v.token.ID == tokenID {
			delete(c.apiTokens, k)
		}
	}
	delete(c.apiTouches, tokenID)
}

func (c *authCache) getMustChange(userID int64, now time.Time) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.mustChange[userID]
	if !ok {
		return false, false
	}
	if now.Sub(entry.cachedAt) >= mustChangeCacheTTL {
		delete(c.mustChange, userID)
		return false, false
	}
	return entry.value, true
}

func (c *authCache) setMustChange(userID int64, value bool, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.mustChange == nil {
		c.mustChange = make(map[int64]boolCacheEntry)
	}
	if len(c.mustChange) >= authCacheMaxEntries {
		c.mustChange = make(map[int64]boolCacheEntry)
	}
	c.mustChange[userID] = boolCacheEntry{value: value, cachedAt: now}
}

func (c *authCache) getQuota(userID int64, now time.Time) (*UserQuota, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.quotas[userID]
	if !ok {
		return nil, false
	}
	if now.Sub(entry.cachedAt) >= userQuotaCacheTTL {
		delete(c.quotas, userID)
		return nil, false
	}
	q := entry.quota
	return &q, true
}

func (c *authCache) setQuota(userID int64, q UserQuota, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.quotas == nil {
		c.quotas = make(map[int64]quotaCacheEntry)
	}
	if len(c.quotas) >= authCacheMaxEntries {
		c.quotas = make(map[int64]quotaCacheEntry)
	}
	c.quotas[userID] = quotaCacheEntry{quota: q, cachedAt: now}
}

func (c *authCache) invalidateQuota(userID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.quotas, userID)
}

func (c *authCache) invalidateUserSessions(userID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range c.sessions {
		if v.user.ID == userID {
			delete(c.sessions, k)
		}
	}
	for k, uid := range c.sessionSlideTo {
		if uid == userID {
			delete(c.sessionSlides, k)
			delete(c.sessionSlideTo, k)
		}
	}
}

func (c *authCache) invalidateUser(userID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range c.sessions {
		if v.user.ID == userID {
			delete(c.sessions, k)
		}
	}
	for k, uid := range c.sessionSlideTo {
		if uid == userID {
			delete(c.sessionSlides, k)
			delete(c.sessionSlideTo, k)
		}
	}
	for k, v := range c.apiTokens {
		if v.user.ID == userID {
			delete(c.apiTokens, k)
			delete(c.apiTouches, v.token.ID)
		}
	}
	delete(c.mustChange, userID)
	delete(c.quotas, userID)
}

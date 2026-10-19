package cloudflare

import (
	"fmt"
	"net/url"
	"strings"
)

// Custom hostnames (Cloudflare for SaaS): a domain that is not in our zone can be served through it once its owner
// points a CNAME at the fallback origin. Cloudflare checks the CNAME and issues the certificate.

// CustomHostname is the state of one custom hostname
type CustomHostname struct {
	ID                 string   `json:"id"`
	Hostname           string   `json:"hostname"`
	Status             string   `json:"status"`
	VerificationErrors []string `json:"verification_errors"`
	SSL                struct {
		Status           string `json:"status"`
		ValidationErrors []struct {
			Message string `json:"message"`
		} `json:"validation_errors"`
	} `json:"ssl"`
}

// CanReadCustomHostnames says whether the zone lists its custom hostnames: the token has the SSL and Certificates
// permission and the feature is on for the zone
func (c *Client) CanReadCustomHostnames(zoneID string) bool {
	return c.ProbeCustomHostnames(zoneID) == nil
}

// customHostnamesReason sorts a refusal of the custom hostnames list: Cloudflare answers 1404 when the token is fine but the
// account has no Cloudflare for SaaS quota, and 401 or 403 with another code when the token lacks the permission
func customHostnamesReason(err error) string {
	message := err.Error()
	switch {
	case strings.Contains(message, "[1404]") || strings.Contains(message, "No quota"):
		return "quota"
	case strings.Contains(message, "status 401") || strings.Contains(message, "status 403"):
		return "permission"
	}
	return "error"
}

// ProbeCustomHostnames asks the zone for its custom hostnames and returns what Cloudflare answered when it refused, so the reason
// (a missing permission, or Custom Hostnames not switched on for the zone) can be shown instead of a bare mark
func (c *Client) ProbeCustomHostnames(zoneID string) error {
	_, err := c.get(fmt.Sprintf("/zones/%s/custom_hostnames?per_page=5", url.PathEscape(zoneID)))
	return err
}

// SetFallbackOrigin names the hostname in the zone that custom hostnames lead to; it has to exist as a proxied DNS record
func (c *Client) SetFallbackOrigin(zoneID, origin string) error {
	_, err := c.put(fmt.Sprintf("/zones/%s/custom_hostnames/fallback_origin", url.PathEscape(zoneID)), map[string]string{"origin": origin})
	return err
}

// CreateCustomHostname registers a domain; the certificate is validated over HTTP once its CNAME points here
func (c *Client) CreateCustomHostname(zoneID, hostname string) (*CustomHostname, error) {
	resp, err := c.post(fmt.Sprintf("/zones/%s/custom_hostnames", url.PathEscape(zoneID)), map[string]any{
		"hostname": hostname,
		"ssl": map[string]any{
			"method":   "http",
			"type":     "dv",
			"settings": map[string]any{"min_tls_version": "1.2"},
		},
	})
	if err != nil {
		return nil, err
	}
	var out CustomHostname
	if err := mapResult(resp.Result, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetCustomHostname reads the current state of a custom hostname
func (c *Client) GetCustomHostname(zoneID, id string) (*CustomHostname, error) {
	resp, err := c.get(fmt.Sprintf("/zones/%s/custom_hostnames/%s", url.PathEscape(zoneID), url.PathEscape(id)))
	if err != nil {
		return nil, err
	}
	var out CustomHostname
	if err := mapResult(resp.Result, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteCustomHostname removes a custom hostname and its certificate
func (c *Client) DeleteCustomHostname(zoneID, id string) error {
	_, err := c.delete(fmt.Sprintf("/zones/%s/custom_hostnames/%s", url.PathEscape(zoneID), url.PathEscape(id)))
	return err
}

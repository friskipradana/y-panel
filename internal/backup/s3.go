package backup

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"
)

// S3Config configures a zero-dependency AWS Signature V4 S3-compatible client (AWS S3, Cloudflare R2, MinIO, Backblaze B2).
type S3Config struct {
	Endpoint       string
	Region         string
	Bucket         string
	Prefix         string
	AccessKey      string
	SecretKey      string
	ForcePathStyle bool
}

// S3Client performs signed PUT/GET/DELETE/HEAD operations against S3-compatible object storage.
type S3Client struct {
	cfg        S3Config
	httpClient *http.Client
}

func NewS3Client(cfg S3Config) (*S3Client, error) {
	cfg.Endpoint = strings.TrimRight(strings.TrimSpace(cfg.Endpoint), "/")
	cfg.Bucket = strings.TrimSpace(cfg.Bucket)
	cfg.Region = strings.TrimSpace(cfg.Region)
	cfg.AccessKey = strings.TrimSpace(cfg.AccessKey)
	cfg.SecretKey = strings.TrimSpace(cfg.SecretKey)
	if cfg.Region == "" {
		cfg.Region = "auto"
	}
	if cfg.Bucket == "" {
		return nil, errors.New("nama bucket S3/R2 wajib diisi")
	}
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, errors.New("Access Key dan Secret Key S3/R2 wajib diisi")
	}
	if cfg.Endpoint == "" {
		cfg.Endpoint = fmt.Sprintf("https://s3.%s.amazonaws.com", cfg.Region)
	}
	if !strings.HasPrefix(cfg.Endpoint, "http://") && !strings.HasPrefix(cfg.Endpoint, "https://") {
		cfg.Endpoint = "https://" + cfg.Endpoint
	}
	return &S3Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Minute,
		},
	}, nil
}

func (c *S3Client) FullKey(name string) string {
	prefix := strings.Trim(strings.TrimSpace(c.cfg.Prefix), "/")
	name = strings.TrimLeft(strings.TrimSpace(name), "/")
	if prefix == "" {
		return name
	}
	return prefix + "/" + name
}

func (c *S3Client) objectURL(key string, query string) (string, error) {
	parsed, err := url.Parse(c.cfg.Endpoint)
	if err != nil {
		return "", fmt.Errorf("endpoint S3 tidak valid: %w", err)
	}
	escapedKey := escapeS3Path(key)
	var rawPath string
	if c.cfg.ForcePathStyle || strings.Contains(parsed.Host, "r2.cloudflarestorage.com") || strings.Contains(parsed.Host, "localhost") || strings.Contains(parsed.Host, "127.0.0.1") {
		if escapedKey != "" {
			rawPath = "/" + url.PathEscape(c.cfg.Bucket) + "/" + escapedKey
		} else {
			rawPath = "/" + url.PathEscape(c.cfg.Bucket)
		}
	} else {
		parsed.Host = c.cfg.Bucket + "." + parsed.Host
		if escapedKey != "" {
			rawPath = "/" + escapedKey
		} else {
			rawPath = "/"
		}
	}
	u := fmt.Sprintf("%s://%s%s", parsed.Scheme, parsed.Host, rawPath)
	if query != "" {
		u += "?" + query
	}
	return u, nil
}

func escapeS3Path(key string) string {
	key = strings.TrimLeft(key, "/")
	if key == "" {
		return ""
	}
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = awsEncode(p)
	}
	return strings.Join(parts, "/")
}

func awsEncode(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' || ch == '~' {
			b.WriteByte(ch)
		} else {
			fmt.Fprintf(&b, "%%%02X", ch)
		}
	}
	return b.String()
}

// SignRequest attaches AWS Signature V4 headers to req.
func (c *S3Client) SignRequest(req *http.Request, payloadHash string, now time.Time) {
	if payloadHash == "" {
		payloadHash = "UNSIGNED-PAYLOAD"
	}
	amzDate := now.UTC().Format("20060102T150405Z")
	dateStamp := now.UTC().Format("20060102")

	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)

	signedHeaderKeys := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	sort.Strings(signedHeaderKeys)

	var canonHeaders strings.Builder
	for _, k := range signedHeaderKeys {
		var val string
		if k == "host" {
			val = req.URL.Host
		} else {
			val = strings.TrimSpace(req.Header.Get(k))
		}
		canonHeaders.WriteString(k + ":" + val + "\n")
	}
	signedHeaders := strings.Join(signedHeaderKeys, ";")

	canonURI := req.URL.EscapedPath()
	if canonURI == "" {
		canonURI = "/"
	}
	canonQuery := canonicalQueryString(req.URL.Query())
	canonicalReq := strings.Join([]string{
		req.Method,
		canonURI,
		canonQuery,
		canonHeaders.String(),
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, c.cfg.Region)
	hashCanon := sha256Hex([]byte(canonicalReq))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hashCanon,
	}, "\n")

	kDate := hmacSHA256([]byte("AWS4"+c.cfg.SecretKey), dateStamp)
	kRegion := hmacSHA256(kDate, c.cfg.Region)
	kService := hmacSHA256(kRegion, "s3")
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.cfg.AccessKey, scope, signedHeaders, signature)
	req.Header.Set("Authorization", authHeader)
}

func canonicalQueryString(q url.Values) string {
	if len(q) == 0 {
		return ""
	}
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		vals := append([]string(nil), q[k]...)
		sort.Strings(vals)
		for _, v := range vals {
			pairs = append(pairs, awsEncode(k)+"="+awsEncode(v))
		}
	}
	return strings.Join(pairs, "&")
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(data))
	return mac.Sum(nil)
}

// TestConnection verifies bucket access via ListObjectsV2 (max-keys=1).
func (c *S3Client) TestConnection(ctx context.Context) error {
	u, err := c.objectURL("", "list-type=2&max-keys=1")
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	c.SignRequest(req, sha256Hex(nil), time.Now())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("gagal menghubungi endpoint S3/R2: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("S3/R2 menolak koneksi (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// PutFile uploads a local file to S3/R2 under the given key with its SHA-256 payload hash.
func (c *S3Client) PutFile(ctx context.Context, key, filePath, sha256Hash string, size int64) error {
	u, err := c.objectURL(key, "")
	if err != nil {
		return err
	}
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u, f)
	if err != nil {
		return err
	}
	req.ContentLength = size
	req.Header.Set("Content-Type", "application/gzip")
	c.SignRequest(req, sha256Hash, time.Now())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("gagal upload ke S3/R2: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("upload S3/R2 gagal (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// GetObject opens a streaming download for an S3/R2 object. Caller must close the returned ReadCloser.
func (c *S3Client) GetObject(ctx context.Context, key string) (io.ReadCloser, int64, error) {
	u, err := c.objectURL(key, "")
	if err != nil {
		return nil, 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, 0, err
	}
	c.SignRequest(req, sha256Hex(nil), time.Now())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("gagal mengunduh dari S3/R2: %w", err)
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		_ = resp.Body.Close()
		return nil, 0, fmt.Errorf("unduh S3/R2 gagal (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return resp.Body, resp.ContentLength, nil
}

// DeleteObject deletes an object from S3/R2.
func (c *S3Client) DeleteObject(ctx context.Context, key string) error {
	u, err := c.objectURL(key, "")
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	c.SignRequest(req, sha256Hex(nil), time.Now())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("hapus objek S3/R2 gagal (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

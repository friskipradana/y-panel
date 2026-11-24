package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

const (
	maxSQLChunkBytes = 24 << 20 // 24 MB per chunk (well below Cloudflare's 100 MB single-request limit)
	maxSQLTotalBytes = 5 << 30  // 5 GB total assembled upload
)

var importUploadIDRe = regexp.MustCompile(`^[a-f0-9]{16,64}$`)

type dbImportJob struct {
	ID         string    `json:"jobId"`
	DatabaseID int64     `json:"databaseId"`
	OwnerID    int64     `json:"-"`
	Filename   string    `json:"filename"`
	Status     string    `json:"status"` // running | done | error
	Message    string    `json:"message,omitempty"`
	Error      string    `json:"error,omitempty"`
	StartedAt  time.Time `json:"startedAt"`
	FinishedAt time.Time `json:"finishedAt,omitempty"`
}

var (
	dbImportJobsMu sync.Mutex
	dbImportJobs   = map[string]*dbImportJob{}
)

func importTempPath(ownerID, dbID int64, uploadID string) string {
	return filepath.Join(os.TempDir(), fmt.Sprintf("reneo-db-import-%d-%d-%s.part", ownerID, dbID, uploadID))
}

func isSupportedSQLFilename(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return strings.HasSuffix(lower, ".sql") || strings.HasSuffix(lower, ".sql.gz") || strings.HasSuffix(lower, ".zip")
}

func newJobID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// handleDatabaseImportChunk receives a sequential binary chunk of a large .sql / .sql.gz / .zip file.
func (s *Server) handleDatabaseImportChunk(w http.ResponseWriter, r *http.Request) {
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	uploadID := strings.TrimSpace(r.URL.Query().Get("uploadId"))
	if !importUploadIDRe.MatchString(uploadID) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid uploadId"})
		return
	}
	filename := strings.TrimSpace(r.URL.Query().Get("filename"))
	if !isSupportedSQLFilename(filename) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "only .sql, .sql.gz, and .zip files are supported"})
		return
	}
	index, err := strconv.Atoi(r.URL.Query().Get("index"))
	if err != nil || index < 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid chunk index"})
		return
	}

	tmpPath := importTempPath(u.ID, item.ID, uploadID)
	flags := os.O_CREATE | os.O_WRONLY | os.O_APPEND
	if index == 0 {
		flags = os.O_CREATE | os.O_WRONLY | os.O_TRUNC
	}
	f, err := os.OpenFile(tmpPath, flags, 0o600)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer f.Close()

	if stat, statErr := f.Stat(); statErr == nil && stat.Size() >= maxSQLTotalBytes {
		s.writeJSON(w, http.StatusRequestEntityTooLarge, jsonResponse{"error": "file exceeds 5 GB limit"})
		return
	}

	written, copyErr := io.Copy(f, http.MaxBytesReader(w, r.Body, maxSQLChunkBytes))
	if copyErr != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "chunk upload failed: " + copyErr.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "written": written, "index": index})
}

// handleDatabaseImportStart kicks off an asynchronous import from the assembled temp file.
func (s *Server) handleDatabaseImportStart(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	var req struct {
		UploadID string `json:"uploadId"`
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	req.UploadID = strings.TrimSpace(req.UploadID)
	req.Filename = strings.TrimSpace(req.Filename)
	if !importUploadIDRe.MatchString(req.UploadID) || !isSupportedSQLFilename(req.Filename) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid uploadId or unsupported file type"})
		return
	}
	tmpPath := importTempPath(u.ID, item.ID, req.UploadID)
	if _, err := os.Stat(tmpPath); err != nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "uploaded file not found; please re-upload"})
		return
	}

	job := &dbImportJob{
		ID:         newJobID(),
		DatabaseID: item.ID,
		OwnerID:    u.ID,
		Filename:   req.Filename,
		Status:     "running",
		StartedAt:  time.Now(),
	}
	dbImportJobsMu.Lock()
	// Sweep finished jobs older than 30 minutes
	for k, existing := range dbImportJobs {
		if existing.Status != "running" && time.Since(existing.FinishedAt) > 30*time.Minute {
			delete(dbImportJobs, k)
		}
	}
	dbImportJobs[job.ID] = job
	dbImportJobsMu.Unlock()

	go func() {
		defer os.Remove(tmpPath)
		summary, impErr := userdb.ImportSQLFile(context.Background(), conn, tmpPath, req.Filename)
		dbImportJobsMu.Lock()
		defer dbImportJobsMu.Unlock()
		job.FinishedAt = time.Now()
		if impErr != nil {
			job.Status = "error"
			job.Error = impErr.Error()
			return
		}
		job.Status = "done"
		job.Message = summary
	}()

	s.auditSensitiveAction(r, u, "database.import.start", "ok", map[string]any{"database": item.Name, "file": req.Filename, "jobId": job.ID})
	s.writeJSON(w, http.StatusAccepted, job)
}

// handleDatabaseImportStatus reports the live state of an asynchronous SQL import job.
func (s *Server) handleDatabaseImportStatus(w http.ResponseWriter, r *http.Request) {
	item, u, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	jobID := strings.TrimSpace(r.PathValue("jobId"))
	dbImportJobsMu.Lock()
	job := dbImportJobs[jobID]
	var snapshot dbImportJob
	found := job != nil && job.DatabaseID == item.ID && job.OwnerID == u.ID
	if found {
		snapshot = *job
	}
	dbImportJobsMu.Unlock()
	if !found {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "import job not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, snapshot)
}

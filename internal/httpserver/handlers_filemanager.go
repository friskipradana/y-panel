package httpserver

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type FileInfoNode struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsDir    bool   `json:"isDir"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	Mode     string `json:"mode"`
}

type DirectoryListResponse struct {
	Path     string         `json:"path"`
	Parent   string         `json:"parent,omitempty"`
	Contents []FileInfoNode `json:"contents"`
}

func (s *Server) handleFileManagerList(w http.ResponseWriter, r *http.Request) {
	qPath := r.URL.Query().Get("path")
	if qPath == "" {
		qPath = "/"
	}

	cleanPath := filepath.Clean(qPath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("Path tidak ditemukan"))
		return
	}

	if !info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Bukan direktori"))
		return
	}

	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membaca direktori"))
		return
	}

	var contents []FileInfoNode
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		contents = append(contents, FileInfoNode{
			Name:     entry.Name(),
			Path:     filepath.Join(cleanPath, entry.Name()),
			IsDir:    entry.IsDir(),
			Size:     info.Size(),
			Modified: info.ModTime().Format(time.RFC3339),
			Mode:     info.Mode().String(),
		})
	}

	// Sort: dirs first, then alphabetical
	sort.Slice(contents, func(i, j int) bool {
		if contents[i].IsDir != contents[j].IsDir {
			return contents[i].IsDir
		}
		return contents[i].Name < contents[j].Name
	})

	parent := filepath.Dir(cleanPath)
	if cleanPath == "/" {
		parent = ""
	}

	resp := DirectoryListResponse{
		Path:     cleanPath,
		Parent:   parent,
		Contents: contents,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleFileManagerRead(w http.ResponseWriter, r *http.Request) {
	qPath := r.URL.Query().Get("path")
	if qPath == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path file harus diisi"))
		return
	}

	cleanPath := filepath.Clean(qPath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("File tidak ditemukan"))
		return
	}

	if info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat membaca direktori"))
		return
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuka file"))
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+info.Name()+"\"")
	io.Copy(w, file)
}

type FileWritePayload struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (s *Server) handleFileManagerWrite(w http.ResponseWriter, r *http.Request) {
	var payload FileWritePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}

	if payload.Path == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path file harus diisi"))
		return
	}

	cleanPath := filepath.Clean(payload.Path)
	info, err := os.Stat(cleanPath)
	if err == nil && info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menimpa direktori"))
		return
	}

	if err := os.WriteFile(cleanPath, []byte(payload.Content), 0644); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyimpan file: "+err.Error()))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"message": "File berhasil disimpan",
	})
}

func (s *Server) handleFileManagerDelete(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)
	if cleanPath == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menghapus root"))
		return
	}
	if err := os.RemoveAll(cleanPath); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menghapus: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerRename(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	oldC := filepath.Clean(payload.OldPath)
	newC := filepath.Clean(payload.NewPath)
	if oldC == "/" || newC == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat dimodifikasi"))
		return
	}
	if err := os.Rename(oldC, newC); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah nama: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerMkdir(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)
	if err := os.MkdirAll(cleanPath, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerTouch(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)
	file, err := os.OpenFile(cleanPath, os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat file: "+err.Error()))
		return
	}
	file.Close()
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerChmod(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path      string `json:"path"`
		Mode      uint32 `json:"mode"`
		Recursive bool   `json:"recursive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)

	if payload.Recursive {
		err := filepath.Walk(cleanPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			return os.Chmod(path, os.FileMode(payload.Mode))
		})
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah permission rekursif: "+err.Error()))
			return
		}
	} else {
		if err := os.Chmod(cleanPath, os.FileMode(payload.Mode)); err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah permission: "+err.Error()))
			return
		}
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func addPathToZip(zipWriter *zip.Writer, baseParent, sourcePath string) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return filepath.Walk(sourcePath, func(path string, walkInfo os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}



			relPath, err := filepath.Rel(baseParent, path)
			if err != nil {
				return err
			}
			zipPath := filepath.ToSlash(relPath)

			header, err := zip.FileInfoHeader(walkInfo)
			if err != nil {
				return err
			}
			header.Name = zipPath
			if walkInfo.IsDir() {
				header.Name += "/"
				_, err = zipWriter.CreateHeader(header)
				return err
			}

			header.Method = zip.Deflate
			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return err
			}

			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(writer, file)
			return err
		})
	}

	relPath, err := filepath.Rel(baseParent, sourcePath)
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(relPath)
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}

	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(writer, file)
	return err
}

func compressToZip(sourcePath, destPath string) error {
	archiveFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer archiveFile.Close()

	zipWriter := zip.NewWriter(archiveFile)
	defer zipWriter.Close()

	return addPathToZip(zipWriter, filepath.Dir(sourcePath), sourcePath)
}

func addPathToTar(tw *tar.Writer, baseParent, sourcePath string) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return filepath.Walk(sourcePath, func(path string, walkInfo os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}



			relPath, err := filepath.Rel(baseParent, path)
			if err != nil {
				return err
			}
			tarPath := filepath.ToSlash(relPath)

			header, err := tar.FileInfoHeader(walkInfo, "")
			if err != nil {
				return err
			}
			header.Name = tarPath
			if walkInfo.IsDir() && !strings.HasSuffix(header.Name, "/") {
				header.Name += "/"
			}

			if err := tw.WriteHeader(header); err != nil {
				return err
			}
			if walkInfo.IsDir() {
				return nil
			}

			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(tw, file)
			return err
		})
	}

	relPath, err := filepath.Rel(baseParent, sourcePath)
	if err != nil {
		return err
	}

	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(relPath)

	if err := tw.WriteHeader(header); err != nil {
		return err
	}

	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(tw, file)
	return err
}

func compressToTarGz(sourcePath, destPath string) error {
	archiveFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer archiveFile.Close()

	gzipWriter := gzip.NewWriter(archiveFile)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	return addPathToTar(tarWriter, filepath.Dir(sourcePath), sourcePath)
}

func extractZip(sourcePath, destPath string) error {
	reader, err := zip.OpenReader(sourcePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath := filepath.Join(destPath, filepath.Clean(file.Name))
		if !strings.HasPrefix(targetPath, filepath.Clean(destPath)+string(os.PathSeparator)) && filepath.Clean(targetPath) != filepath.Clean(destPath) {
			return errors.New("arsip ZIP mengandung path tidak aman")
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, file.Mode()); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		src, err := file.Open()
		if err != nil {
			return err
		}

		dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, file.Mode())
		if err != nil {
			src.Close()
			return err
		}

		_, copyErr := io.Copy(dst, src)
		src.Close()
		dst.Close()
		if copyErr != nil {
			return copyErr
		}
	}

	return nil
}

func extractTarArchive(tr *tar.Reader, destPath string) error {
	for {
		header, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		targetPath := filepath.Join(destPath, filepath.Clean(header.Name))
		if !strings.HasPrefix(targetPath, filepath.Clean(destPath)+string(os.PathSeparator)) && filepath.Clean(targetPath) != filepath.Clean(destPath) {
			return errors.New("arsip TAR mengandung path tidak aman")
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, os.FileMode(header.Mode)); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return err
			}
			file, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(file, tr)
			file.Close()
			if copyErr != nil {
				return copyErr
			}
		}
	}
}

func extractTarGz(sourcePath, destPath string) error {
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()

	return extractTarArchive(tar.NewReader(gzipReader), destPath)
}

func extractTarFile(sourcePath, destPath string) error {
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	return extractTarArchive(tar.NewReader(file), destPath)
}

func (s *Server) handleFileManagerCompress(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Target   string `json:"target"`
		DestName string `json:"destName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanTarget := filepath.Clean(payload.Target)
	cleanDest := filepath.Clean(payload.DestName)

	if _, err := os.Stat(cleanTarget); os.IsNotExist(err) {
		s.writeError(w, http.StatusNotFound, errors.New("Target tidak ditemukan"))
		return
	}

	if err := os.MkdirAll(filepath.Dir(cleanDest), 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyiapkan folder arsip: "+err.Error()))
		return
	}

	var err error
	lowerDest := strings.ToLower(cleanDest)
	if strings.HasSuffix(lowerDest, ".zip") {
		err = compressToZip(cleanTarget, cleanDest)
	} else if strings.HasSuffix(lowerDest, ".tar.gz") || strings.HasSuffix(lowerDest, ".tgz") {
		err = compressToTarGz(cleanTarget, cleanDest)
	} else {
		s.writeError(w, http.StatusBadRequest, errors.New("Format kompresi tidak didukung. Gunakan .zip atau .tar.gz"))
		return
	}

	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Eksekusi kompresi gagal: "+err.Error()))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerExtract(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Source string `json:"source"`
		Dest   string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanSource := filepath.Clean(payload.Source)
	cleanDest := filepath.Clean(payload.Dest)

	if err := os.MkdirAll(cleanDest, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori tujuan ekstraksi: "+err.Error()))
		return
	}

	var err error
	lowerSource := strings.ToLower(cleanSource)
	if strings.HasSuffix(lowerSource, ".zip") {
		err = extractZip(cleanSource, cleanDest)
	} else if strings.HasSuffix(lowerSource, ".tar.gz") || strings.HasSuffix(lowerSource, ".tgz") {
		err = extractTarGz(cleanSource, cleanDest)
	} else if strings.HasSuffix(lowerSource, ".tar") {
		err = extractTarFile(cleanSource, cleanDest)
	} else {
		s.writeError(w, http.StatusBadRequest, errors.New("Format arsip tidak didukung."))
		return
	}

	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengekstrak arsip: "+err.Error()))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

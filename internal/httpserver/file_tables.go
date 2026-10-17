package httpserver

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The folder listing of the File Manager as a spreadsheet: every column can be ordered and narrowed to
// some of its values, on the agent, over the whole folder.

func fileType(f FileInfoNode) string {
	if f.IsDir {
		return "folder"
	}
	if ext := strings.ToLower(filepath.Ext(f.Name)); ext != "" && ext != f.Name {
		return ext
	}
	return "file"
}

// sizeBucket groups sizes so a filter can offer a handful of choices instead of every byte count
func sizeBucket(f FileInfoNode) string {
	switch {
	case f.IsDir:
		return "folder"
	case f.Size < 100<<10:
		return "lt100k"
	case f.Size < 10<<20:
		return "lt10m"
	case f.Size < 1<<30:
		return "lt1g"
	}
	return "gte1g"
}

// ageBucket says how long ago something changed
func ageBucket(t time.Time, now time.Time) string {
	age := now.Sub(t)
	switch {
	case age < 24*time.Hour:
		return "day"
	case age < 7*24*time.Hour:
		return "week"
	case age < 30*24*time.Hour:
		return "month"
	case age < 365*24*time.Hour:
		return "year"
	}
	return "older"
}

func fileSpec(now time.Time) listquery.Spec[FileInfoNode] {
	return listquery.Spec[FileInfoNode]{
		Columns: []listquery.Column[FileInfoNode]{
			{Key: "name", Value: func(f FileInfoNode) string { return f.Name }, Compare: func(a, b FileInfoNode) int {
				// folders stay together; ascending puts them first
				if a.IsDir != b.IsDir {
					if a.IsDir {
						return -1
					}
					return 1
				}
				return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
			}},
			{Key: "type", Value: fileType},
			{Key: "size", Value: sizeBucket, Compare: func(a, b FileInfoNode) int {
				switch {
				case a.Size < b.Size:
					return -1
				case a.Size > b.Size:
					return 1
				}
				return 0
			}},
			{Key: "mode", Value: func(f FileInfoNode) string { return f.Mode }},
			{Key: "modified", Value: func(f FileInfoNode) string { return ageBucket(f.modTime, now) }, Compare: func(a, b FileInfoNode) int {
				switch {
				case a.modTime.Before(b.modTime):
					return -1
				case a.modTime.After(b.modTime):
					return 1
				}
				return 0
			}},
		},
		Search: func(f FileInfoNode) string { return strings.ToLower(f.Name) },
	}
}

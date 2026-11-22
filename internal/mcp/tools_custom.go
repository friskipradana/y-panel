package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Resting heights used to stack new widgets below existing ones (mirrors the frontend).
var widgetHeights = map[string]int{
	"clock-uptime":    120,
	"system-vital":    162,
	"quick-note":      140,
	"network-traffic": 208,
	"cpu-graph":       156,
	"ping":            168,
}

var widgetDefaults = map[string]map[string]any{
	"ping":            {"host": "1.1.1.1", "port": 0, "intervalSec": 10, "range": "15m", "label": ""},
	"cpu-graph":       {"range": "15m"},
	"system-vital":    {"mode": "bars", "range": "15m"},
	"network-traffic": {"range": "15m"},
	"quick-note":      {"text": "", "color": "yellow"},
}

// Types that may exist more than once on a desktop.
var widgetMulti = map[string]bool{"ping": true, "quick-note": true}

type widgetLayout struct {
	raw     map[string]any
	widgets []map[string]any
}

func loadWidgetLayout(ctx context.Context, client *apiClient) (*widgetLayout, error) {
	data, code, err := client.get(ctx, "/api/v1/me/widgets")
	if _, aerr := apiResult(data, code, err); aerr != nil {
		return nil, aerr
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, fmt.Errorf("decode widget layout: %w", err)
	}
	if env.Data == nil {
		return nil, fmt.Errorf("no widget layout is stored for this account yet; open the panel desktop once so it syncs, then retry")
	}
	layout := &widgetLayout{raw: env.Data}
	if list, ok := env.Data["placedWidgets"].([]any); ok {
		for _, item := range list {
			if m, ok := item.(map[string]any); ok {
				layout.widgets = append(layout.widgets, m)
			}
		}
	}
	return layout, nil
}

func (l *widgetLayout) save(ctx context.Context, client *apiClient) error {
	list := make([]any, len(l.widgets))
	for i, w := range l.widgets {
		list[i] = w
	}
	l.raw["placedWidgets"] = list
	data, code, err := client.put(ctx, "/api/v1/me/widgets", map[string]any{"data": l.raw})
	_, aerr := apiResult(data, code, err)
	return aerr
}

func num(v any) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}

// registerCustomTools adds tools that compose several API calls.
func registerCustomTools(s *Server, client *apiClient, isAdmin bool) {
	s.Register(Tool{
		Name:        "server_overview",
		Description: "One-call health snapshot: host facts, CPU/RAM/disk, Docker state, container counts, projects needing attention and unread notifications. Start here when diagnosing or reporting status.",
		InputSchema: InputSchema{Type: "object"},
		Annotations: &ToolAnnotations{Title: "Server overview", ReadOnlyHint: true, IdempotentHint: true},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		out := map[string]any{"checkedAt": time.Now().UTC().Format(time.RFC3339)}

		fetch := func(path string) (any, error) {
			data, code, err := client.get(ctx, path)
			if err != nil {
				return nil, err
			}
			if code >= 400 {
				return nil, fmt.Errorf("HTTP %d", code)
			}
			var v any
			if err := json.Unmarshal(data, &v); err != nil {
				return nil, err
			}
			return v, nil
		}
		note := func(section string, err error) {
			errs, _ := out["errors"].(map[string]string)
			if errs == nil {
				errs = map[string]string{}
				out["errors"] = errs
			}
			errs[section] = err.Error()
		}

		if v, err := fetch("/api/v1/system/summary"); err != nil {
			note("system", err)
		} else if m, ok := v.(map[string]any); ok {
			out["host"] = map[string]any{
				"hostname": m["hostname"], "os": m["osName"], "kernel": m["kernel"],
				"uptimeSeconds": m["uptimeSeconds"], "ipAddresses": m["ipAddresses"],
			}
			out["resources"] = map[string]any{
				"cpuPercent": m["cpuUsagePercent"], "cpuTemp": m["cpuTemp"],
				"memory": m["memory"], "storage": m["storage"], "network": m["networkIO"],
			}
			out["docker"] = map[string]any{
				"installed": m["dockerInstalled"], "reachable": m["dockerReachable"], "status": m["dockerStatus"],
			}
			if p, ok := m["projects"]; ok {
				out["projects"] = p
			}
		}

		if v, err := fetch("/api/v1/containers"); err != nil {
			note("containers", err)
		} else {
			items := []any{}
			if m, ok := v.(map[string]any); ok {
				if list, ok := m["containers"].([]any); ok {
					items = list
				}
			} else if list, ok := v.([]any); ok {
				items = list
			}
			running := 0
			var unhealthy []string
			for _, it := range items {
				c, _ := it.(map[string]any)
				state := strings.ToLower(fmt.Sprint(c["state"]))
				if state == "running" {
					running++
				} else if state != "" && state != "exited" && state != "created" {
					unhealthy = append(unhealthy, fmt.Sprint(c["name"]))
				}
			}
			out["containers"] = map[string]any{"total": len(items), "running": running, "stopped": len(items) - running, "problem": unhealthy}
		}

		if v, err := fetch("/api/v1/projects/attention-summary"); err != nil {
			note("attention", err)
		} else {
			out["attention"] = v
		}
		if v, err := fetch("/api/v1/notifications"); err == nil {
			if m, ok := v.(map[string]any); ok {
				out["unreadNotifications"] = m["unreadCount"]
			}
		}

		return formatJSON(out)
	})

	s.Register(Tool{
		Name:        "widgets_get",
		Description: "Read the desktop widget layout of this account (types, positions, per-widget config such as ping host or note text).",
		InputSchema: InputSchema{Type: "object"},
		Annotations: &ToolAnnotations{Title: "Desktop widgets", ReadOnlyHint: true, IdempotentHint: true},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		layout, err := loadWidgetLayout(ctx, client)
		if err != nil {
			return "", err
		}
		return formatJSON(layout.widgets)
	})

	s.Register(Tool{
		Name: "widget_add",
		Description: "Add a widget to this account's desktop. Types: clock-uptime, system-vital, network-traffic, cpu-graph, " +
			"ping (host/port/intervalSec/label/range) and quick-note (text/color). ping and quick-note may be added many times. " +
			"Open panel sessions show the change after a reload.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"type":   {Type: "string", Description: "Widget type.", Enum: []string{"clock-uptime", "system-vital", "network-traffic", "cpu-graph", "ping", "quick-note"}},
				"config": {Type: "object", Description: `Optional settings, e.g. {"host":"8.8.8.8","port":0,"intervalSec":10,"label":"Google DNS"} for ping or {"text":"deploy at 10","color":"blue"} for quick-note.`},
				"x":      {Type: "integer", Description: "Optional left position in px."},
				"y":      {Type: "integer", Description: "Optional top position in px."},
			},
			Required: []string{"type"},
		},
		Annotations: &ToolAnnotations{Title: "Add widget"},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		wtype := stringArg(args, "type", "")
		if _, ok := widgetHeights[wtype]; !ok {
			return "", fmt.Errorf("unknown widget type %q", wtype)
		}
		layout, err := loadWidgetLayout(ctx, client)
		if err != nil {
			return "", err
		}

		if !widgetMulti[wtype] {
			for _, w := range layout.widgets {
				if w["type"] == wtype {
					return fmt.Sprintf("Widget %q is already on the desktop (id %v).", wtype, w["id"]), nil
				}
			}
		}

		config := map[string]any{}
		for k, v := range widgetDefaults[wtype] {
			config[k] = v
		}
		if extra, ok := args["config"].(map[string]any); ok {
			for k, v := range extra {
				config[k] = v
			}
		}

		// Default spot: right column, below the lowest widget
		x, y := 976, 64
		for _, w := range layout.widgets {
			if wx := int(num(w["x"])); wx > x-140 {
				x = wx
			}
		}
		for _, w := range layout.widgets {
			if int(num(w["x"])) < x-60 {
				continue
			}
			bottom := int(num(w["y"])) + widgetHeights[fmt.Sprint(w["type"])] + 15
			if bottom > y {
				y = bottom
			}
		}
		if _, ok := args["x"]; ok {
			x = intArg(args, "x", x)
		}
		if _, ok := args["y"]; ok {
			y = intArg(args, "y", y)
		}

		id := fmt.Sprintf("widget-%s-%d", wtype, time.Now().UnixMilli())
		entry := map[string]any{"id": id, "type": wtype, "x": x, "y": y, "isLocked": false}
		if len(config) > 0 {
			entry["config"] = config
		}
		layout.widgets = append(layout.widgets, entry)
		if err := layout.save(ctx, client); err != nil {
			return "", err
		}
		return formatJSON(entry)
	})

	s.Register(Tool{
		Name:        "widget_remove",
		Description: "Remove a widget from this account's desktop by id (see widgets_get). A quick-note's text is lost.",
		InputSchema: InputSchema{
			Type:       "object",
			Properties: map[string]Property{"id": {Type: "string", Description: "Widget id."}},
			Required:   []string{"id"},
		},
		Annotations: &ToolAnnotations{Title: "Remove widget", DestructiveHint: true, IdempotentHint: true},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("widget id is required")
		}
		layout, err := loadWidgetLayout(ctx, client)
		if err != nil {
			return "", err
		}
		kept := layout.widgets[:0]
		found := false
		for _, w := range layout.widgets {
			if fmt.Sprint(w["id"]) == id {
				found = true
				continue
			}
			kept = append(kept, w)
		}
		if !found {
			return "", fmt.Errorf("widget %q not found", id)
		}
		layout.widgets = kept
		if err := layout.save(ctx, client); err != nil {
			return "", err
		}
		return fmt.Sprintf("Widget %q removed.", id), nil
	})
}

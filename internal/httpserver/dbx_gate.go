package httpserver

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// DBX is one container for every account of the panel, and DBX itself knows no accounts: whoever reaches it can open any saved
// connection, read its history and its settings, and use its file and network features. So the panel does not forward what a
// browser sends. Every request to /dbx/api goes through dbxDecide, which
//   - answers the list of connections itself, with only the databases of the account (never a password),
//   - fills in the real host, port and credentials when the page connects, from the panel's own records,
//   - lets data requests through only for connections of the account,
//   - and refuses everything else (saving connections, plugins and their file access, import and export, history, AI, settings).

type dbxConn struct {
	ID       string // rdb-<id>: never one that DBX was told about by a browser
	Name     string
	Type     string // DBX name of the engine
	Host     string
	Port     int
	User     string
	Password string
	Database string
	Params   string
}

type dbxAction int

const (
	dbxForward dbxAction = iota
	dbxAnswer
	dbxStream // an event stream with nothing in it, kept open
)

type dbxVerdict struct {
	Action dbxAction
	Status int
	Body   []byte
	// NewBody replaces the body of a forwarded request (the connect request)
	NewBody []byte
}

const dbxIDPrefix = "rdb-"

var dbxIDRe = regexp.MustCompile(`rdb-[0-9]+`)

func dbxConnectionID(databaseID int64) string { return dbxIDPrefix + strconv.FormatInt(databaseID, 10) }

func dbxAnswerJSON(status int, body string) dbxVerdict {
	return dbxVerdict{Action: dbxAnswer, Status: status, Body: []byte(body)}
}

var dbxDenied = dbxAnswerJSON(http.StatusForbidden, `{"error":"this is not available in the database client of Reneo"}`)

// requests of the page that only read what DBX keeps for itself; nothing writes it (every write is refused below), so it stays
// as DBX shipped it
var dbxReadable = map[string]bool{
	"/version":                                true,
	"/app-settings/web-capabilities":          true,
	"/app-settings/sql-file-upload-max-bytes": true,
	"/migration/status":                       true,
	"/layout/sidebar":                         true,
	"/layout/table-vgroups":                   true,
	"/plugins":                                true,
	"/plugins/active":                         true,
	"/saved-sql":                              true,
	"/ai/configs":                             true,
	"/ai/config":                              true,
	"/ai/provider-configs":                    true,
	"/ai/chat-selection":                      true,
	"/ssh/prompts":                            true,
	"/ssh/prompts/pending":                    true,
	"/tunnel-profiles/list":                   true,
	"/prompt-templates":                       true,
	"/prompt-templates/global-instructions":   true,
}

// writes of the page that are answered with "done" and kept nowhere: it saves its layout and snapshots its state all the time
var dbxQuietWrites = regexp.MustCompile(`^/(layout/|database-backups$|tab-runtime-cache/|connection/database-info/save$)`)

// operations on a connection that is already known to DBX
var dbxConnectionOps = map[string]bool{
	"/connection/disconnect":                true,
	"/connection/check-health":              true,
	"/connection/is-open":                   true,
	"/connection/database-info":             true,
	"/connection/prewarm":                   true,
	"/connection/identifier-quote":          true,
	"/connection/close-database":            true,
	"/connection/final-proxy-port":          true,
	"/connection/session-credential-status": true,
}

// requests that only build text (SQL, plans) and need no connection
var dbxBuilders = regexp.MustCompile(`^/(dialect/|query/(build-|parse-|analyze-|find-|prepare-|supports-|rewrite-|review-|plugin-plan|data-grid-extractor))`)

// what a page may not do even on its own connection: it reads and writes files of the container
var dbxFileFeatures = regexp.MustCompile(`^/(mongo/(import|export|dump)|query/large-value/download)`)

var dbxDataPrefixes = []string{"/schema/", "/query/", "/redis/", "/mongo/"}

func dbxDecide(method, path string, query url.Values, body []byte, conns []dbxConn) dbxVerdict {
	// not the API: the page itself, its scripts and styles
	if !strings.HasPrefix(path, "/api/") {
		if method == http.MethodGet || method == http.MethodHead {
			return dbxVerdict{Action: dbxForward}
		}
		return dbxDenied
	}
	route := strings.TrimPrefix(path, "/api")

	owned := map[string]*dbxConn{}
	for i := range conns {
		owned[conns[i].ID] = &conns[i]
	}

	// the page asks whether it must log in: the panel has done it already, for the account
	if route == "/auth/check" {
		return dbxAnswerJSON(http.StatusOK, `{"authenticated":true,"required":false,"setup_required":false}`)
	}
	if strings.HasPrefix(route, "/auth/") {
		return dbxDenied
	}

	switch route {
	case "/connection/list":
		return dbxAnswerJSON(http.StatusOK, dbxConnectionList(conns))
	case "/connection/liveness-events", "/connection/idle-closed-events":
		return dbxVerdict{Action: dbxStream}
	case "/connection/connect":
		return dbxConnect(body, owned)
	}
	if method == http.MethodGet && dbxReadable[route] {
		return dbxVerdict{Action: dbxForward}
	}
	if dbxQuietWrites.MatchString(route) && method != http.MethodGet {
		return dbxAnswerJSON(http.StatusOK, `{}`)
	}
	if dbxFileFeatures.MatchString(route) {
		return dbxDenied
	}

	isData := false
	for _, prefix := range dbxDataPrefixes {
		if strings.HasPrefix(route, prefix) {
			isData = true
		}
	}
	if !isData && !dbxConnectionOps[route] {
		return dbxDenied
	}

	// every connection the request names must be the account's, wherever in the request it is named, also when it is
	// written with escapes that only the receiver decodes
	mentioned := dbxMentions(query, body)
	for _, id := range mentioned {
		if owned[id] == nil {
			return dbxDenied
		}
	}
	// a name that is not ours in a field that holds a connection is a request for something that is not ours
	if dbxNamesForeignConnection(query, body) {
		return dbxDenied
	}
	if len(mentioned) == 0 && !dbxBuilders.MatchString(route) {
		return dbxDenied
	}
	return dbxVerdict{Action: dbxForward}
}

// dbxMentions lists every id of a panel connection in the query and in the body, as written and as decoded
func dbxMentions(query url.Values, body []byte) []string {
	found := dbxIDRe.FindAllString(query.Encode(), -1)
	for key, values := range query {
		found = append(found, dbxIDRe.FindAllString(key, -1)...)
		for _, value := range values {
			found = append(found, dbxIDRe.FindAllString(value, -1)...)
		}
	}
	if len(body) == 0 {
		return found
	}
	found = append(found, dbxIDRe.FindAllString(string(body), -1)...)
	var parsed any
	if json.Unmarshal(body, &parsed) == nil {
		var walk func(v any)
		walk = func(v any) {
			switch value := v.(type) {
			case string:
				found = append(found, dbxIDRe.FindAllString(value, -1)...)
			case []any:
				for _, item := range value {
					walk(item)
				}
			case map[string]any:
				for k, item := range value {
					found = append(found, dbxIDRe.FindAllString(k, -1)...)
					walk(item)
				}
			}
		}
		walk(parsed)
	}
	return found
}

// dbxNamesForeignConnection finds a field called connection... whose value is not an id of this panel at all
func dbxNamesForeignConnection(query url.Values, body []byte) bool {
	foreign := func(key, value string) bool {
		k := strings.ToLower(strings.NewReplacer("_", "", "-", "").Replace(key))
		return strings.Contains(k, "connection") && value != "" && !dbxIDRe.MatchString(value)
	}
	for key, values := range query {
		for _, value := range values {
			if foreign(key, value) {
				return true
			}
		}
	}
	if len(body) == 0 {
		return false
	}
	var parsed any
	if json.Unmarshal(body, &parsed) != nil {
		return false
	}
	var walk func(key string, v any) bool
	walk = func(key string, v any) bool {
		switch value := v.(type) {
		case string:
			return foreign(key, value)
		case []any:
			for _, item := range value {
				if walk(key, item) {
					return true
				}
			}
		case map[string]any:
			for k, item := range value {
				if walk(k, item) {
					return true
				}
			}
		}
		return false
	}
	return walk("", parsed)
}

// dbxConnect answers a request to open a connection with the connection the panel knows under that id: whatever host, port,
// user or script the page put in it is dropped
func dbxConnect(body []byte, owned map[string]*dbxConn) dbxVerdict {
	var req struct {
		Config struct {
			ID string `json:"id"`
		} `json:"config"`
	}
	if json.Unmarshal(body, &req) != nil || owned[req.Config.ID] == nil {
		return dbxDenied
	}
	conn := owned[req.Config.ID]
	config := map[string]any{
		"id": conn.ID, "name": conn.Name, "db_type": conn.Type,
		"host": conn.Host, "port": conn.Port, "username": conn.User, "password": conn.Password, "database": conn.Database,
	}
	if conn.Params != "" {
		config["url_params"] = conn.Params
	}
	raw, _ := json.Marshal(map[string]any{"config": config})
	return dbxVerdict{Action: dbxForward, NewBody: raw}
}

// dbxConnectionList is what the page shows in its sidebar: the databases of the account, with a placeholder where DBX expects
// a password (the real one is put in when the page connects, and never leaves the panel)
func dbxConnectionList(conns []dbxConn) string {
	list := make([]map[string]any, 0, len(conns))
	for _, conn := range conns {
		list = append(list, map[string]any{
			"id": conn.ID, "name": conn.Name, "db_type": conn.Type,
			"driver_profile": nil, "driver_label": nil, "url_params": nil,
			"host": conn.Host, "port": conn.Port, "username": conn.User, "password": "reneo", "database": conn.Database,
			"color": nil, "connect_timeout_secs": 10, "query_timeout_secs": 60, "idle_timeout_secs": 60,
			"manual_transaction_timeout_secs": 300, "idle_disconnect_secs": 0, "keepalive_interval_secs": 30,
			"ssl": false, "sysdba": false, "connection_string": nil, "external_config": nil,
			"jdbc_driver_class": nil, "jdbc_driver_paths": []string{}, "save_password": true,
		})
	}
	raw, _ := json.Marshal(list)
	return string(raw)
}

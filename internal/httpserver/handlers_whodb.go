package httpserver

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// WhoDB (clidey/whodb) lightweight web client for user databases (~35 MB Go + React).
// One sidecar container bound to loopback serves every account behind /whodb/<key>/;
// the proxy rewrites root-relative paths, auto-connects the UI on first open, and injects
// the real decrypted credentials server-side on GraphQL Login mutations so credentials
// never leak into browser JS and the session stays locked to that single database.

const (
	whodbContainer = "reneo-whodb"
	whodbImage     = "clidey/whodb:latest"
)

var whodbEnsureMu sync.Mutex

func whodbPort() int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PANEL_WHODB_PORT"))); err == nil && v > 1024 && v < 65536 {
		return v
	}
	return 18088
}

func whodbReachable() bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(whodbPort())), 400*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func (s *Server) whodbEncryptionKey() string {
	mac := hmac.New(sha256.New, []byte(s.cfg.EncryptionKey))
	mac.Write([]byte("reneo-whodb-encryption-key"))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Server) ensureWhodb(ctx context.Context) error {
	if whodbReachable() {
		return nil
	}
	whodbEnsureMu.Lock()
	defer whodbEnsureMu.Unlock()
	if whodbReachable() {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()

	state, err := dockerOutput(ctx, "inspect", "-f", "{{.State.Status}}", whodbContainer)
	switch {
	case err != nil:
		port := strconv.Itoa(whodbPort())
		args := []string{
			"run", "-d",
			"--name", whodbContainer,
			"--label", "reneo.kind=database-control",
			"--restart", "unless-stopped",
			"--network", "host",
			"-e", "PORT=" + port,
			"-e", "WHODB_ENCRYPTION_KEY=" + s.whodbEncryptionKey(),
			whodbImage,
		}
		if out, runErr := dockerOutput(ctx, args...); runErr != nil {
			return fmt.Errorf("could not start WhoDB: %s", firstOutputLine(out))
		}
	case state != "running":
		if out, startErr := dockerOutput(ctx, "start", whodbContainer); startErr != nil {
			return fmt.Errorf("could not start WhoDB: %s", firstOutputLine(out))
		}
	}

	for i := 0; i < 50; i++ {
		if whodbReachable() {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}
	return fmt.Errorf("WhoDB did not become ready")
}

func whodbType(engine string) string {
	switch engine {
	case "postgres":
		return "Postgres"
	case "mysql":
		return "MySQL"
	case "mariadb":
		return "MariaDB"
	case "mongodb":
		return "MongoDB"
	case "redis":
		return "Redis"
	}
	return ""
}

// handleDatabaseWhodb ensures WhoDB is running and redirects the browser to /whodb/<key>/.
func (s *Server) handleDatabaseWhodb(w http.ResponseWriter, r *http.Request) {
	owner := userFromCtx(r)
	found := s.databaseByAccessKey(owner, r.PathValue("key"))
	if found == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database not found"})
		return
	}
	r.SetPathValue("id", strconv.FormatInt(found.ID, 10))
	_, item, u, ok := s.databaseConn(w, r)
	if !ok {
		return
	}
	if whodbType(item.Engine) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "WhoDB does not support this engine"})
		return
	}
	if err := s.ensureWhodb(r.Context()); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.whodb", "ok", map[string]any{"id": item.ID})

	key := s.databaseAccessKey(item.ID)
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, "/whodb/"+key+"/?reneo_auto=1", http.StatusFound)
}

func whodbShimJS(prefix, key string, bound *database.ManagedDatabase) string {
	cfg, _ := json.Marshal(map[string]any{
		"prefix":   prefix,
		"key":      key,
		"type":     whodbType(bound.Engine),
		"host":     userDatabaseHost,
		"port":     strconv.Itoa(bound.HostPort),
		"user":     bound.Username,
		"database": bound.DatabaseName,
	})
	return fmt.Sprintf(`(function(){
var C=%s;
var P=C.prefix;
var f=window.fetch;
if(f){window.fetch=function(u,o){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(P)){u=P+u}return f.call(this,u,o)}}
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(P)){arguments[1]=P+u}return xo.apply(this,arguments)};
function fixUrl(u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(P))return P+u;return u}
var ps=history.pushState;history.pushState=function(s,t,u){return ps.call(this,s,t,fixUrl(u))};
var rs=history.replaceState;history.replaceState=function(s,t,u){return rs.call(this,s,t,fixUrl(u))};
try{
  var ls=window.localStorage;
  var ns="reneo_whodb_"+C.key+"::";
  var _get=Storage.prototype.getItem;
  var _set=Storage.prototype.setItem;
  var _rem=Storage.prototype.removeItem;
  Storage.prototype.getItem=function(k){return _get.call(this,this===ls?ns+String(k):k)};
  Storage.prototype.setItem=function(k,v){return _set.call(this,this===ls?ns+String(k):k,v)};
  Storage.prototype.removeItem=function(k){return _rem.call(this,this===ls?ns+String(k):k)};
}catch(e){}

function setNativeValue(el,val){
  if(!el)return;
  var desc=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");
  if(desc&&desc.set){desc.set.call(el,val)}else{el.value=val}
  el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));
}

function findInputByLabelOrPlaceholder(hints){
  var inputs=document.querySelectorAll("input");
  for(var i=0;i<inputs.length;i++){
    var inp=inputs[i];
    if(inp.type==="hidden"||inp.type==="checkbox"||inp.type==="radio")continue;
    var ph=(inp.placeholder||"").toLowerCase();
    var nm=(inp.name||"").toLowerCase();
    var aria=(inp.getAttribute("aria-label")||"").toLowerCase();
    var lbl="";
    if(inp.id){var l=document.querySelector('label[for="'+inp.id+'"]');if(l)lbl=(l.textContent||"").toLowerCase()}
    if(!lbl&&inp.parentElement){lbl=(inp.parentElement.textContent||"").toLowerCase()}
    var hay=ph+" "+nm+" "+aria+" "+lbl;
    for(var h=0;h<hints.length;h++){if(hay.indexOf(hints[h])!==-1)return inp}
  }
  return null;
}

function runAutoConnect(){
  var q=new URLSearchParams(location.search);
  var flagKey="reneo_whodb_auto_"+C.key;
  if(q.get("reneo_auto")==="1"){try{sessionStorage.removeItem(flagKey)}catch(e){}}
  try{if(sessionStorage.getItem(flagKey)==="1")return}catch(e){}

  var tries=0;
  var engineChosen=false;
  var timer=setInterval(function(){
    tries++;
    if(tries>40){clearInterval(timer);return}
    var connectBtn=null;
    var buttons=document.querySelectorAll("button");
    for(var i=0;i<buttons.length;i++){
      var txt=(buttons[i].textContent||"").trim().toLowerCase();
      if(txt==="connect"||txt.indexOf("connect")===0){connectBtn=buttons[i];break}
    }
    if(!connectBtn)return;

    // 1. Select engine if not already matching
    if(!engineChosen){
      var combo=document.querySelector('[role="combobox"], button[aria-haspopup="listbox"]');
      if(combo&&(combo.textContent||"").toLowerCase().indexOf(C.type.toLowerCase())===-1){
        combo.click();
        setTimeout(function(){
          var opts=document.querySelectorAll('[role="option"], [data-radix-collection-item]');
          for(var j=0;j<opts.length;j++){
            if((opts[j].textContent||"").trim().toLowerCase()===C.type.toLowerCase()){opts[j].click();break}
          }
          engineChosen=true;
        },150);
        return;
      }
      engineChosen=true;
    }

    // 2. Fill visible fields (server-side proxy injects real password on POST /api/query)
    setNativeValue(findInputByLabelOrPlaceholder(["host name","hostname","host or connection"]),C.host);
    setNativeValue(findInputByLabelOrPlaceholder(["port"]),C.port);
    if(C.user)setNativeValue(findInputByLabelOrPlaceholder(["username","user"]),C.user);
    var pwdInput=document.querySelector('input[type="password"]');
    if(pwdInput)setNativeValue(pwdInput,"reneo-managed-secret");
    if(C.database)setNativeValue(findInputByLabelOrPlaceholder(["enter database","database"]),C.database);

    try{sessionStorage.setItem(flagKey,"1")}catch(e){}
    clearInterval(timer);
    setTimeout(function(){connectBtn.click()},180);
  },250);
}

if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",runAutoConnect)}else{runAutoConnect()}
})();`, string(cfg))
}

func whodbSplitPath(p string) (key, rest string) {
	trimmed := strings.TrimPrefix(p, "/whodb/")
	key, rest, _ = strings.Cut(trimmed, "/")
	return key, rest
}

// patchWhodbLoginValue recursively updates only existing credential fields inside GraphQL variables
// (preserving the exact field casing/schema that WhoDB's frontend sent so GraphQL never sees unknown fields).
func patchWhodbLoginValue(v any, bound *database.ManagedDatabase, password string) {
	switch node := v.(type) {
	case map[string]any:
		// Check if this map is a Key/Value pair (e.g. {"Key":"Port","Value":"5432"} or {"key":"Port","value":"5432"})
		var kName, vKey string
		for k := range node {
			switch strings.ToLower(k) {
			case "key":
				kName = k
			case "value":
				vKey = k
			}
		}
		if kName != "" && vKey != "" {
			keyLabel := strings.ToLower(strings.TrimSpace(fmt.Sprint(node[kName])))
			switch keyLabel {
			case "port":
				node[vKey] = strconv.Itoa(bound.HostPort)
			case "hostname", "host":
				node[vKey] = userDatabaseHost
			case "username", "user":
				node[vKey] = bound.Username
			case "password":
				node[vKey] = password
			case "database":
				node[vKey] = bound.DatabaseName
			}
		}
		for k, val := range node {
			switch strings.ToLower(k) {
			case "hostname", "host":
				if _, ok := val.(string); ok {
					node[k] = userDatabaseHost
				}
			case "port":
				switch val.(type) {
				case string:
					node[k] = strconv.Itoa(bound.HostPort)
				case float64:
					node[k] = bound.HostPort
				}
			case "username", "user":
				if _, ok := val.(string); ok && bound.Username != "" {
					node[k] = bound.Username
				}
			case "password":
				if _, ok := val.(string); ok {
					node[k] = password
				}
			case "database":
				if _, ok := val.(string); ok && bound.DatabaseName != "" {
					node[k] = bound.DatabaseName
				}
			default:
				patchWhodbLoginValue(val, bound, password)
			}
		}
	case []any:
		for _, item := range node {
			patchWhodbLoginValue(item, bound, password)
		}
	}
}

// rewriteWhodbLoginBody replaces existing credential values in a WhoDB GraphQL Login mutation
// with the exact decrypted credentials of bound, without ever adding unknown GraphQL fields.
func (s *Server) rewriteWhodbLoginBody(raw []byte, bound *database.ManagedDatabase) ([]byte, bool) {
	var gql map[string]any
	if err := json.Unmarshal(raw, &gql); err != nil {
		return raw, false
	}
	opName, _ := gql["operationName"].(string)
	queryStr, _ := gql["query"].(string)
	isLogin := strings.Contains(strings.ToLower(opName), "login") ||
		strings.Contains(queryStr, "Login(") ||
		strings.Contains(queryStr, "LoginSource(")
	if !isLogin {
		return raw, false
	}
	vars, ok := gql["variables"]
	if !ok || vars == nil {
		return raw, false
	}
	password, err := crypto.Decrypt(s.cfg.EncryptionKey, bound.PasswordEncrypted)
	if err != nil {
		return raw, false
	}
	patchWhodbLoginValue(vars, bound, password)
	updated, err := json.Marshal(gql)
	if err != nil {
		return raw, false
	}
	return updated, true
}

// whodbProxy forwards /whodb/<key>/ to the local WhoDB sidecar with strict per-database isolation.
func (s *Server) whodbProxy() http.Handler {
	target := &url.URL{Scheme: "http", Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(whodbPort()))}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		key, rest := whodbSplitPath(r.URL.Path)
		bound := s.databaseByAccessKey(u, key)
		if bound == nil {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/whodb/"+key {
			http.Redirect(w, r, "/whodb/"+key+"/", http.StatusPermanentRedirect)
			return
		}
		prefix := "/whodb/" + key
		if rest == "reneo-whodb-shim.js" {
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			_, _ = w.Write([]byte(whodbShimJS(prefix, key, bound)))
			return
		}

		// Inject real decrypted credentials server-side on GraphQL Login mutations
		if r.Method == http.MethodPost && rest == "api/query" && r.Body != nil {
			raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
			if err != nil {
				http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
				return
			}
			if replaced, ok := s.rewriteWhodbLoginBody(raw, bound); ok {
				raw = replaced
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			r.ContentLength = int64(len(raw))
			r.Header.Set("Content-Length", strconv.Itoa(len(raw)))
		}

		proxy := &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = target.Scheme
				pr.Out.URL.Host = target.Host
				pr.Out.Host = target.Host
				pr.Out.URL.Path = "/" + rest
				pr.Out.URL.RawPath = ""
				pr.Out.Header.Del("Authorization")
				if !strings.HasPrefix(rest, "assets/") && !strings.HasPrefix(rest, "api/") {
					pr.Out.Header.Del("Accept-Encoding")
				}
			},
			ModifyResponse: func(resp *http.Response) error {
				// Scope WhoDB cookies to /whodb/<key>/ so multi-DB tabs never overwrite each other
				scopeSetCookiesToPrefix(resp.Header, prefix+"/")
				if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") && resp.Header.Get("Content-Encoding") == "" {
					page, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
					_ = resp.Body.Close()
					if err != nil {
						return err
					}
					page = bytes.ReplaceAll(page, []byte(`src="/`), []byte(`src="`+prefix+`/`))
					page = bytes.ReplaceAll(page, []byte(`href="/`), []byte(`href="`+prefix+`/`))
					page = bytes.ReplaceAll(page, []byte(`rel="manifest"`), []byte(`rel="manifest" crossorigin="use-credentials"`))
					shimTag := []byte(`<script src="` + prefix + `/reneo-whodb-shim.js?v=2"></script>`)
					page = bytes.Replace(page, []byte("<head>"), append([]byte("<head>"), shimTag...), 1)
					resp.Body = io.NopCloser(bytes.NewReader(page))
					resp.ContentLength = int64(len(page))
					resp.Header.Set("Content-Length", strconv.Itoa(len(page)))
					resp.Header.Set("Cache-Control", "no-store")
				}
				return nil
			},
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
				http.Error(w, "WhoDB is not running. Open it again from the Database window.", http.StatusBadGateway)
			},
		}
		proxy.ServeHTTP(w, r)
	})
}

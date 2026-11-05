package httpapi

import (
	"encoding/json"
	"errors"
	"github.com/Murphy-404/OneCup/backend/domain"
	"github.com/Murphy-404/OneCup/backend/storage"
	"io"
	"io/fs"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
)

type Options struct {
	Origin          string
	StaticDirectory string
}

const MaxBody = 5_000_000

type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }
func JSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
func Report(w http.ResponseWriter, err error) {
	status, message := 500, "服务器读取或保存失败，请导出当前页面记录并检查存储"
	var requestError *Error
	if errors.As(err, &requestError) {
		status, message = requestError.Status, requestError.Message
	}
	if errors.Is(err, storage.ErrConflict) {
		status, message = 409, err.Error()
	}
	if status == 429 {
		w.Header().Set("Retry-After", "900")
	}
	JSON(w, status, map[string]any{"error": message})
}
func ReadJSON(w http.ResponseWriter, r *http.Request, target any) error {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return &Error{415, "请使用 JSON 请求"}
	}
	reader := http.MaxBytesReader(w, r.Body, MaxBody)
	defer reader.Close()
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(target); err != nil {
		var large *http.MaxBytesError
		if errors.As(err, &large) {
			return &Error{413, "记录不能超过 5 MB"}
		}
		return &Error{400, "JSON 格式无效"}
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		var large *http.MaxBytesError
		if errors.As(err, &large) {
			return &Error{413, "记录不能超过 5 MB"}
		}
		return &Error{400, "JSON 请求只能包含一个对象"}
	}
	return nil
}
func Trusted(r *http.Request, configured string) bool {
	incoming, err := url.Parse("http://" + r.Host)
	if err != nil || incoming.Host == "" {
		return false
	}
	host := incoming.Hostname()
	trusted := host == "localhost" || host == "127.0.0.1" || host == "::1"
	origin, err := url.Parse(configured)
	if configured != "" && (err != nil || origin.Host != r.Host) {
		if !trusted {
			return false
		}
	} else if configured != "" {
		trusted = true
	}
	source := r.Header.Get("Origin")
	return trusted && r.Header.Get("Sec-Fetch-Site") != "cross-site" && (source == "" || source == "http://"+r.Host || source == configured)
}
func New(store *storage.Store, options Options) http.Handler {
	static := Static(options.StaticDirectory)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if r.URL.Path == "/healthz" {
			if _, err := store.Read(); err != nil {
				Report(w, err)
				return
			}
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Cache-Control", "no-store")
			w.Write([]byte("ok\n"))
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			static.ServeHTTP(w, r)
			return
		}
		if !Trusted(r, options.Origin) {
			Report(w, &Error{403, "仅允许配置来源和可信设备访问此实例"})
			return
		}
		switch r.URL.Path {
		case "/api/workspace":
			switch r.Method {
			case http.MethodGet:
				value, err := store.Read()
				if err != nil {
					Report(w, err)
					return
				}
				JSON(w, 200, value)
			case http.MethodPut:
				var input struct {
					Data     json.RawMessage `json:"data"`
					Revision *float64        `json:"revision"`
				}
				if err := ReadJSON(w, r, &input); err != nil {
					Report(w, err)
					return
				}
				if input.Revision == nil || *input.Revision < 0 || *input.Revision >= 9007199254740991 || *input.Revision != math.Trunc(*input.Revision) {
					Report(w, &Error{400, "记录版本无效"})
					return
				}
				if _, err := domain.Normalize(input.Data); err != nil {
					Report(w, &Error{400, err.Error()})
					return
				}
				value, err := store.Write(input.Data, int64(*input.Revision))
				if err != nil {
					Report(w, err)
					return
				}
				JSON(w, 200, value)
			default:
				Report(w, &Error{405, "方法不支持"})
			}
		case "/api/backup":
			if r.Method != http.MethodGet {
				Report(w, &Error{405, "方法不支持"})
				return
			}
			value, err := store.Read()
			if err != nil {
				Report(w, err)
				return
			}
			w.Header().Set("Content-Disposition", `attachment; filename="onecup-server-backup.json"`)
			JSON(w, 200, value.Data)
		default:
			Report(w, &Error{404, "接口不存在"})
		}
	})
}
func Static(directory string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		if directory == "" {
			Report(w, &Error{404, "页面不存在"})
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			Report(w, &Error{405, "方法不支持"})
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		if !fs.ValidPath(name) || strings.Contains(name, `\`) {
			Report(w, &Error{403, "资源路径无效"})
			return
		}
		root, err := os.OpenRoot(directory)
		if err != nil {
			Report(w, err)
			return
		}
		defer root.Close()
		file, err := root.Open(name)
		if err != nil && path.Ext(name) == "" {
			name = "index.html"
			file, err = root.Open(name)
		}
		if err != nil {
			Report(w, &Error{404, "资源不存在"})
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			Report(w, &Error{404, "资源不存在"})
			return
		}
		contentType := mime.TypeByExtension(path.Ext(name))
		if path.Ext(name) == ".md" {
			contentType = "text/plain; charset=utf-8"
		}
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.Header().Set("Cache-Control", "no-cache")
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeContent(w, r, name, info.ModTime(), file)
	})
}

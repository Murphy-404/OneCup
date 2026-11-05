package httpapi

import (
	"bytes"
	"github.com/Murphy-404/OneCup/backend/storage"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInvalidRequestsDoNotChangeWorkspace(t *testing.T) {
	store, err := storage.Open(filepath.Join(t.TempDir(), "data.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	handler := New(store, Options{Origin: "https://drinks.test"})
	for _, tc := range []struct {
		name, host, origin, media, body string
		status                          int
	}{
		{"foreign host", "evil.test", "", "application/json", "{}", 403},
		{"foreign origin", "drinks.test", "https://evil.test", "application/json", "{}", 403},
		{"wrong media", "drinks.test", "https://drinks.test", "text/plain", "{}", 415},
		{"invalid data", "drinks.test", "https://drinks.test", "application/json", `{"data":{},"revision":0}`, 400},
		{"large data", "drinks.test", "https://drinks.test", "application/json", `{"data":"` + strings.Repeat("x", MaxBody) + `"}`, 413},
		{"large trailing whitespace", "drinks.test", "https://drinks.test", "application/json", "{}" + strings.Repeat(" ", MaxBody), 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("PUT", "https://"+tc.host+"/api/workspace", bytes.NewBufferString(tc.body))
			r.Header.Set("Content-Type", tc.media)
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d want %d: %s", w.Code, tc.status, w.Body)
			}
			current, err := store.Read()
			if err != nil || current.Revision != 0 {
				t.Fatal("invalid request changed workspace", err)
			}
		})
	}
}

func TestStaticRoutesAndHeaders(t *testing.T) {
	directory := t.TempDir()
	os.WriteFile(filepath.Join(directory, "index.html"), []byte("<html>onecup</html>"), 0600)
	handler := Static(directory)
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/", 200}, {"HEAD", "/", 200}, {"GET", "/recipes/one", 200}, {"GET", "/missing.png", 404}, {"GET", "/../secret.txt", 403}, {"POST", "/", 405},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.status {
				t.Fatal(w.Code, w.Body)
			}
			if w.Code == 200 && w.Header().Get("Content-Security-Policy") == "" {
				t.Fatal("missing CSP")
			}
			if tc.method == "HEAD" && w.Body.Len() != 0 {
				t.Fatal("HEAD returned body")
			}
		})
	}
}

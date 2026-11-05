package httpapi

import (
	"bytes"
	"encoding/json"
	"github.com/Murphy-404/OneCup/backend/domain"
	"github.com/Murphy-404/OneCup/backend/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestWorkspaceHTTPContract(t *testing.T) {
	store, err := storage.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	handler := New(store, Options{Origin: "https://drinks.test"})
	call := func(method, path, origin, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "https://drinks.test"+path, bytes.NewBufferString(body))
		if origin != "" {
			request.Header.Set("Origin", origin)
		}
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	if r := call("GET", "/api/workspace", "", ""); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	body, _ := json.Marshal(map[string]any{"data": domain.Fresh(), "revision": 0})
	if r := call("PUT", "/api/workspace", "https://evil.test", string(body)); r.Code != 403 {
		t.Fatal(r.Code)
	}
	if r := call("PUT", "/api/workspace", "https://drinks.test", string(body)); r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	if r := call("GET", "/api/auth/login", "", ""); r.Code != 404 {
		t.Fatal(r.Code)
	}
	if r := call("PUT", "/api/workspace", "https://drinks.test", `{"data":{},"revision":1}`); r.Code != 400 {
		t.Fatal(r.Code)
	}
	if r := call("PUT", "/api/workspace", "https://drinks.test", string(body)+"{}"); r.Code != 400 {
		t.Fatal(r.Code)
	}
	if r := call("GET", "/healthz", "", ""); r.Code != http.StatusOK {
		t.Fatal(r.Code)
	}
}

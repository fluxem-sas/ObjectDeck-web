// Package handler contains all HTTP request handlers.
// Handlers are thin: parse request → call service → write response.
// No business logic lives here.
package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"s3invoiceapi/internal/config"
	s3svc "s3invoiceapi/internal/s3"
)

// Handler holds the dependencies injected into all HTTP handlers.
type Handler struct {
	s3  s3svc.Service
	cfg *config.Config
	log *slog.Logger
}

// New creates a Handler with the given dependencies.
func New(svc s3svc.Service, cfg *config.Config, log *slog.Logger) *Handler {
	return &Handler{s3: svc, cfg: cfg, log: log}
}

// Routes registers all API routes and returns the mux.
// The caller is responsible for adding the SPA static handler.
func (h *Handler) Routes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/s3/list",    h.List)
	mux.HandleFunc("POST /api/s3/object",  h.GetObject)
	mux.HandleFunc("POST /api/s3/browse",  h.Browse)
	mux.HandleFunc("POST /api/s3/upload",  h.Upload)
	mux.HandleFunc("POST /api/s3/delete",  h.Delete)
	mux.HandleFunc("POST /api/s3/replace", h.Replace)

	// SPA static file serving
	mux.HandleFunc("/", h.staticHandler)

	return mux
}

// staticHandler serves the Vite build and falls back to index.html for SPA routing.
// Sets aggressive caching for hashed Vite assets and gzip for text responses.
func (h *Handler) staticHandler(w http.ResponseWriter, r *http.Request) {
	base := h.cfg.StaticDir
	full := filepath.Join(base, filepath.Clean("/"+r.URL.Path))

	// Prevent path traversal
	if !strings.HasPrefix(full, filepath.Clean(base)) {
		http.NotFound(w, r)
		return
	}

	if info, err := os.Stat(full); err == nil && !info.IsDir() {
		// Vite hashes asset filenames (e.g. index-Abc123.js) — cache forever
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFile(w, r, full)
		return
	}

	// SPA fallback: all unknown paths → index.html (React Router handles routing)
	index := filepath.Join(base, "index.html")
	if _, err := os.Stat(index); err != nil {
		http.Error(w, "frontend not built — run: make build-web", http.StatusServiceUnavailable)
		return
	}
	// No cache for index.html so the browser always fetches the latest version
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	http.ServeFile(w, r, index)
}

// ── response helpers ───────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "encoding error", http.StatusInternalServerError)
	}
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}

// parseConnectionFromForm reads the "connection" JSON field from multipart form data.
func parseConnectionFromForm(r *http.Request) (json.RawMessage, error) {
	raw := strings.TrimSpace(r.FormValue("connection"))
	if raw == "" {
		return nil, fmt.Errorf("missing 'connection' form field")
	}
	return json.RawMessage(raw), nil
}

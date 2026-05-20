package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"s3invoiceapi/internal/domain"
	s3svc "s3invoiceapi/internal/s3"
)

func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	maxBytes := h.cfg.MaxUploadMB << 20
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		jsonError(w, "error parsing form (check file size limit)", http.StatusBadRequest)
		return
	}

	connRaw, err := parseConnectionFromForm(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var conn domain.S3Connection
	if err := json.Unmarshal(connRaw, &conn); err != nil {
		jsonError(w, "invalid connection JSON", http.StatusBadRequest)
		return
	}

	prefix := r.FormValue("prefix")

	fileHeaders := r.MultipartForm.File["file"]
	if len(fileHeaders) == 0 {
		jsonError(w, "no files provided", http.StatusBadRequest)
		return
	}

	var uploads []s3svc.UploadFile
	for _, fh := range fileHeaders {
		f, err := fh.Open()
		if err != nil {
			jsonError(w, "error opening file: "+fh.Filename, http.StatusInternalServerError)
			return
		}
		data, readErr := io.ReadAll(f)
		f.Close()
		if readErr != nil {
			jsonError(w, "error reading file: "+fh.Filename, http.StatusInternalServerError)
			return
		}
		uploads = append(uploads, s3svc.UploadFile{
			Name:        fh.Filename,
			ContentType: fh.Header.Get("Content-Type"),
			Data:        data,
		})
	}

	keys, err := h.s3.Upload(r.Context(), conn, uploads, prefix)
	if err != nil {
		h.log.Error("upload failed", "err", err)
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, map[string]any{"ok": true, "keys": keys})
}

func (h *Handler) Replace(w http.ResponseWriter, r *http.Request) {
	maxBytes := h.cfg.MaxUploadMB << 20
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		jsonError(w, "error parsing form", http.StatusBadRequest)
		return
	}

	connRaw, err := parseConnectionFromForm(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var conn domain.S3Connection
	if err := json.Unmarshal(connRaw, &conn); err != nil {
		jsonError(w, "invalid connection JSON", http.StatusBadRequest)
		return
	}

	key := r.FormValue("key")
	if key == "" {
		jsonError(w, "key is required", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "error reading file from form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "error reading file data", http.StatusInternalServerError)
		return
	}

	if err := h.s3.Replace(r.Context(), conn, key, s3svc.UploadFile{
		Name:        header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
	}); err != nil {
		h.log.Error("replace failed", "key", key, "err", err)
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, map[string]bool{"ok": true})
}

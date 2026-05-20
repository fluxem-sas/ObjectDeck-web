package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"s3invoiceapi/internal/domain"
)

type objectRequest struct {
	Connection domain.S3Connection `json:"connection"`
	Key        string              `json:"key"`
}

func (h *Handler) GetObject(w http.ResponseWriter, r *http.Request) {
	var req objectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	result, err := h.s3.GetObject(r.Context(), req.Connection, req.Key)
	if err != nil {
		h.log.Error("get object failed", "key", req.Key, "err", err)
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	defer result.Body.Close()

	w.Header().Set("Content-Type", result.ContentType)
	if result.ContentLength > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", result.ContentLength))
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, result.FileName))

	if _, err := copyBody(w, result.Body); err != nil {
		h.log.Error("streaming object failed", "key", req.Key, "err", err)
	}
}

package handler

import (
	"encoding/json"
	"net/http"

	"s3invoiceapi/internal/domain"
)

type deleteRequest struct {
	Connection domain.S3Connection `json:"connection"`
	Key        string              `json:"key"`
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	var req deleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.s3.Delete(r.Context(), req.Connection, req.Key); err != nil {
		h.log.Error("delete failed", "key", req.Key, "err", err)
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, map[string]bool{"ok": true})
}

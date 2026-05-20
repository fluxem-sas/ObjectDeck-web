package handler

import (
	"encoding/json"
	"net/http"

	"s3invoiceapi/internal/domain"
	s3svc "s3invoiceapi/internal/s3"
)

type browseRequest struct {
	Connection        domain.S3Connection `json:"connection"`
	Prefix            string              `json:"prefix"`
	ContinuationToken *string             `json:"continuationToken"`
	MaxKeys           int32               `json:"maxKeys"`
}

func (h *Handler) Browse(w http.ResponseWriter, r *http.Request) {
	var req browseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	result, err := h.s3.Browse(r.Context(), req.Connection, req.Prefix, s3svc.BrowseOpts{
		ContinuationToken: req.ContinuationToken,
		MaxKeys:           req.MaxKeys,
	})
	if err != nil {
		h.log.Error("browse failed", "prefix", req.Prefix, "err", err)
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, result)
}

package handler

import (
	"encoding/json"
	"net/http"

	"s3invoiceapi/internal/domain"
	s3svc "s3invoiceapi/internal/s3"
)

type listRequest struct {
	Connection        domain.S3Connection `json:"connection"`
	ContinuationToken *string             `json:"continuationToken"`
	MaxKeys           int32               `json:"maxKeys"`
	LoadAll           bool                `json:"loadAll"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	var req listRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	result, err := h.s3.List(r.Context(), req.Connection, s3svc.ListOpts{
		ContinuationToken: req.ContinuationToken,
		MaxKeys:           req.MaxKeys,
		LoadAll:           req.LoadAll,
	})
	if err != nil {
		h.log.Error("list failed", "err", err)
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	jsonOK(w, result)
}

// Package s3 defines the storage service contract and provides an AWS implementation.
package s3

import (
	"context"
	"io"

	"s3invoiceapi/internal/domain"
)

// UploadFile carries the data for a single file to be uploaded.
type UploadFile struct {
	Name        string
	ContentType string
	Data        []byte
}

// ListOpts configures a flat object listing.
type ListOpts struct {
	ContinuationToken *string
	MaxKeys           int32
	LoadAll           bool
}

// ListResult is the output of a List operation.
type ListResult struct {
	Files                 []domain.ListedFile `json:"files"`
	NextContinuationToken *string             `json:"nextContinuationToken"`
	IsTruncated           bool                `json:"isTruncated"`
}

// BrowseOpts configures a single-level directory listing.
type BrowseOpts struct {
	ContinuationToken *string
	MaxKeys           int32
}

// BrowseResult is the output of a Browse operation.
type BrowseResult struct {
	Folders               []domain.FolderEntry `json:"folders"`
	Files                 []domain.ListedFile  `json:"files"`
	Prefix                string               `json:"prefix"`
	NextContinuationToken *string              `json:"nextContinuationToken"`
	IsTruncated           bool                 `json:"isTruncated"`
}

// ObjectResult carries a streaming S3 object response.
type ObjectResult struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	FileName      string
}

// Service defines the S3 storage operations contract.
// Concrete implementations can wrap any S3-compatible SDK (AWS, MinIO, etc.).
type Service interface {
	List(ctx context.Context, conn domain.S3Connection, opts ListOpts) (ListResult, error)
	GetObject(ctx context.Context, conn domain.S3Connection, key string) (ObjectResult, error)
	Browse(ctx context.Context, conn domain.S3Connection, prefix string, opts BrowseOpts) (BrowseResult, error)
	Upload(ctx context.Context, conn domain.S3Connection, files []UploadFile, prefix string) ([]string, error)
	Delete(ctx context.Context, conn domain.S3Connection, key string) error
	Replace(ctx context.Context, conn domain.S3Connection, key string, file UploadFile) error
}

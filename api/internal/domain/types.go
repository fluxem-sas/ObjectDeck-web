// Package domain contains the core types shared across all layers.
// No external dependencies — just plain Go structs that mirror the frontend TypeScript types.
package domain

// S3Connection holds user-provided credentials and endpoint configuration.
type S3Connection struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Region          string `json:"region"`
	Endpoint        string `json:"endpoint"`
	Bucket          string `json:"bucket"`
	Prefix          string `json:"prefix"`
	ForcePathStyle  bool   `json:"forcePathStyle"`
}

// FileType classifies an S3 object by its content.
type FileType string

const (
	FileTypeImage FileType = "image"
	FileTypePDF   FileType = "pdf"
	FileTypeOther FileType = "other"
)

// ListedFile represents a single S3 object in a flat listing.
type ListedFile struct {
	Key          string   `json:"key"`
	FileName     string   `json:"fileName"`
	Extension    string   `json:"extension"`
	Type         FileType `json:"type"`
	Size         int64    `json:"size"`
	LastModified *string  `json:"lastModified"`
	ETag         *string  `json:"etag"`
}

// FolderEntry represents a common prefix (virtual folder) returned when
// browsing with a delimiter.
type FolderEntry struct {
	Prefix string `json:"prefix"`
	Name   string `json:"name"`
}

package s3

import (
	"path/filepath"
	"strings"

	"s3invoiceapi/internal/domain"
)

var imageExts = map[string]bool{
	"jpg": true, "jpeg": true, "png": true,
	"gif": true, "webp": true, "bmp": true,
}

// classifyKey extracts fileName, extension, and FileType from an S3 object key.
func classifyKey(key string) (fileName, extension string, fileType domain.FileType) {
	fileName = filepath.Base(key)

	if idx := strings.LastIndex(fileName, "."); idx >= 0 {
		extension = strings.ToLower(fileName[idx+1:])
	}

	switch {
	case imageExts[extension]:
		fileType = domain.FileTypeImage
	case extension == "pdf":
		fileType = domain.FileTypePDF
	default:
		fileType = domain.FileTypeOther
	}
	return
}

// normalizePrefix trims leading and trailing slashes.
func normalizePrefix(p string) string {
	return strings.Trim(strings.TrimSpace(p), "/")
}

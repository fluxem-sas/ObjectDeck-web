package handler

import (
	"io"
	"net/http"
)

// copyBody streams an io.Reader to the ResponseWriter.
// Returns bytes written and any write error.
func copyBody(w http.ResponseWriter, r io.Reader) (int64, error) {
	return io.Copy(w, r)
}

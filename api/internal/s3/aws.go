package s3

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3invoiceapi/internal/domain"
)

// awsService is the AWS SDK v2 implementation of Service.
type awsService struct{}

// New returns a Service backed by the AWS SDK v2.
// A fresh S3 client is created per request using the caller-supplied credentials.
func New() Service {
	return &awsService{}
}

func (a *awsService) List(ctx context.Context, conn domain.S3Connection, opts ListOpts) (ListResult, error) {
	client, err := newClient(conn)
	if err != nil {
		return ListResult{}, err
	}

	maxKeys := clampMaxKeys(opts.MaxKeys, 1000)

	prefix := normalizePrefix(conn.Prefix)
	var prefixPtr *string
	if prefix != "" {
		prefixPtr = aws.String(prefix + "/")
	}

	var files []domain.ListedFile
	token := opts.ContinuationToken
	var nextToken *string
	truncated := false

	for {
		resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            bucket(conn),
			Prefix:            prefixPtr,
			ContinuationToken: token,
			MaxKeys:           aws.Int32(maxKeys),
		})
		if err != nil {
			return ListResult{}, fmt.Errorf("ListObjectsV2: %w", err)
		}

		for _, obj := range resp.Contents {
			if obj.Key == nil || strings.HasSuffix(*obj.Key, "/") {
				continue
			}
			files = append(files, parseFile(*obj.Key, obj.Size, obj.LastModified, obj.ETag))
		}

		truncated = aws.ToBool(resp.IsTruncated)
		nextToken = resp.NextContinuationToken

		if !opts.LoadAll || !truncated {
			break
		}
		token = nextToken
	}

	sort.Slice(files, func(i, j int) bool {
		if files[i].LastModified == nil {
			return false
		}
		if files[j].LastModified == nil {
			return true
		}
		return *files[i].LastModified > *files[j].LastModified
	})

	if files == nil {
		files = []domain.ListedFile{}
	}

	if opts.LoadAll {
		return ListResult{Files: files}, nil
	}
	return ListResult{Files: files, NextContinuationToken: nextToken, IsTruncated: truncated}, nil
}

func (a *awsService) GetObject(ctx context.Context, conn domain.S3Connection, key string) (ObjectResult, error) {
	if strings.TrimSpace(key) == "" {
		return ObjectResult{}, fmt.Errorf("key is required")
	}

	client, err := newClient(conn)
	if err != nil {
		return ObjectResult{}, err
	}

	resp, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: bucket(conn),
		Key:    aws.String(key),
	})
	if err != nil {
		return ObjectResult{}, fmt.Errorf("GetObject: %w", err)
	}

	ct := "application/octet-stream"
	if resp.ContentType != nil {
		ct = *resp.ContentType
	}

	var cl int64
	if resp.ContentLength != nil {
		cl = *resp.ContentLength
	}

	return ObjectResult{
		Body:          resp.Body,
		ContentType:   ct,
		ContentLength: cl,
		FileName:      filepath.Base(key),
	}, nil
}

func (a *awsService) Browse(ctx context.Context, conn domain.S3Connection, prefix string, opts BrowseOpts) (BrowseResult, error) {
	client, err := newClient(conn)
	if err != nil {
		return BrowseResult{}, err
	}

	maxKeys := clampMaxKeys(opts.MaxKeys, 500)

	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	var prefixPtr *string
	if prefix != "" {
		prefixPtr = aws.String(prefix)
	}

	resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:            bucket(conn),
		Prefix:            prefixPtr,
		Delimiter:         aws.String("/"),
		ContinuationToken: opts.ContinuationToken,
		MaxKeys:           aws.Int32(maxKeys),
	})
	if err != nil {
		return BrowseResult{}, fmt.Errorf("ListObjectsV2: %w", err)
	}

	folders := make([]domain.FolderEntry, 0)
	for _, cp := range resp.CommonPrefixes {
		if cp.Prefix == nil {
			continue
		}
		full := *cp.Prefix
		name := strings.TrimSuffix(strings.TrimPrefix(full, prefix), "/")
		folders = append(folders, domain.FolderEntry{Prefix: full, Name: name})
	}

	files := make([]domain.ListedFile, 0)
	for _, obj := range resp.Contents {
		if obj.Key == nil || strings.HasSuffix(*obj.Key, "/") {
			continue
		}
		files = append(files, parseFile(*obj.Key, obj.Size, obj.LastModified, obj.ETag))
	}

	return BrowseResult{
		Folders:               folders,
		Files:                 files,
		Prefix:                prefix,
		NextContinuationToken: resp.NextContinuationToken,
		IsTruncated:           aws.ToBool(resp.IsTruncated),
	}, nil
}

func (a *awsService) Upload(ctx context.Context, conn domain.S3Connection, files []UploadFile, prefix string) ([]string, error) {
	client, err := newClient(conn)
	if err != nil {
		return nil, err
	}

	prefix = normalizePrefix(prefix)
	keys := make([]string, 0, len(files))

	for _, f := range files {
		key := f.Name
		if prefix != "" {
			key = prefix + "/" + f.Name
		}

		ct := f.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}

		_, err := client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:        bucket(conn),
			Key:           aws.String(key),
			Body:          bytes.NewReader(f.Data),
			ContentType:   aws.String(ct),
			ContentLength: aws.Int64(int64(len(f.Data))),
		})
		if err != nil {
			return keys, fmt.Errorf("PutObject(%s): %w", f.Name, err)
		}
		keys = append(keys, key)
	}

	return keys, nil
}

func (a *awsService) Delete(ctx context.Context, conn domain.S3Connection, key string) error {
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("key is required")
	}

	client, err := newClient(conn)
	if err != nil {
		return err
	}

	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: bucket(conn),
		Key:    aws.String(key),
	})
	return err
}

func (a *awsService) Replace(ctx context.Context, conn domain.S3Connection, key string, file UploadFile) error {
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("key is required")
	}

	client, err := newClient(conn)
	if err != nil {
		return err
	}

	ct := file.ContentType
	if ct == "" {
		ct = "application/octet-stream"
	}

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        bucket(conn),
		Key:           aws.String(key),
		Body:          bytes.NewReader(file.Data),
		ContentType:   aws.String(ct),
		ContentLength: aws.Int64(int64(len(file.Data))),
	})
	return err
}

// ── private helpers ────────────────────────────────────────────────────────

func parseFile(key string, size *int64, lastMod *time.Time, etag *string) domain.ListedFile {
	fileName, ext, fileType := classifyKey(key)

	var lastModStr *string
	if lastMod != nil {
		s := lastMod.UTC().Format("2006-01-02T15:04:05Z")
		lastModStr = &s
	}

	var etagStr *string
	if etag != nil {
		cleaned := strings.ReplaceAll(*etag, `"`, "")
		etagStr = &cleaned
	}

	return domain.ListedFile{
		Key:          key,
		FileName:     fileName,
		Extension:    ext,
		Type:         fileType,
		Size:         aws.ToInt64(size),
		LastModified: lastModStr,
		ETag:         etagStr,
	}
}

func clampMaxKeys(n, max int32) int32 {
	if n <= 0 || n > max {
		return max
	}
	return n
}

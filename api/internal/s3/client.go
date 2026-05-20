package s3

import (
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"s3invoiceapi/internal/domain"
)

// newClient validates the connection and builds an AWS S3 client.
func newClient(conn domain.S3Connection) (*s3.Client, error) {
	if err := validate(conn); err != nil {
		return nil, err
	}

	creds := credentials.NewStaticCredentialsProvider(
		strings.TrimSpace(conn.AccessKeyID),
		conn.SecretAccessKey,
		"",
	)

	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(strings.TrimSpace(conn.Region)),
		config.WithCredentialsProvider(creds),
	)
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(strings.TrimSpace(conn.Endpoint))
		o.UsePathStyle = conn.ForcePathStyle
	})

	return client, nil
}

// validate checks that all required connection fields are present.
func validate(conn domain.S3Connection) error {
	required := map[string]string{
		"accessKeyId":     conn.AccessKeyID,
		"secretAccessKey": conn.SecretAccessKey,
		"region":          conn.Region,
		"endpoint":        conn.Endpoint,
		"bucket":          conn.Bucket,
	}
	for field, value := range required {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("missing required connection field: %s", field)
		}
	}
	return nil
}

// bucket returns a trimmed bucket name pointer for SDK calls.
func bucket(conn domain.S3Connection) *string {
	return aws.String(strings.TrimSpace(conn.Bucket))
}

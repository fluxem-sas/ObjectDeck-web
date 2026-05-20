# S3-ObjectDeck

A lightweight S3-compatible storage browser. Navigate, preview, upload, and delete files directly from your browser — no database, no extra configuration required.

## What does it do?

- **File Explorer** — browse folders and files just like Windows Explorer
- **Image Gallery** — preview images with lazy loading and real thumbnails
- **Viewer** — open images full screen, PDFs in a new tab
- **Fuzzy Search** — find files by name, key, or extension in real time
- **File Management** — upload, replace, and delete files directly
- **Dashboard** — bucket metrics: total files, storage used, breakdown by type
- **Multi-connection** — save multiple S3 connections and switch between them from the header

## What can it connect to?

Works with **any S3-compatible provider**:

| Provider | Endpoint |
|---|---|
| **Amazon S3** | `https://s3.{region}.amazonaws.com` |
| **Cloudflare R2** | `https://{account_id}.r2.cloudflarestorage.com` |
| **Railway S3** | Your Railway Object Storage endpoint |
| **MinIO** | `https://your-minio-instance.com` |
| **Backblaze B2** | `https://s3.{region}.backblazeb2.com` |
| **DigitalOcean Spaces** | `https://{region}.digitaloceanspaces.com` |
| **Supabase Storage** | `https://{ref}.supabase.co/storage/v1/s3` |

## Configuration

Open the app and go to **Settings**, then fill in:

| Field | Description | Example |
|---|---|---|
| **Endpoint URL** | Your S3 provider URL | `https://s3.us-east-1.amazonaws.com` |
| **Bucket Name** | Name of the bucket | `my-invoices` |
| **Region** | Bucket region | `us-east-1` |
| **Prefix** | Folder inside the bucket (optional) | `bills` |
| **Access Key ID** | Your access key | `AKIAIOSFODNN7EXAMPLE` |
| **Secret Access Key** | Your secret key | `wJalrXUtnFEMI/...` |
| **Force Path Style** | Enable for most non-AWS providers | `✓` |

Click **Test connection** to validate before connecting. Credentials are stored in the browser's localStorage — never on the server.

## Privacy & Security

- Credentials are **never stored on the server** — only in the user's browser localStorage.
- Each request includes credentials and creates a temporary S3 client on the fly.
- The server acts as a secure proxy so credentials are never exposed in the frontend.

---

# Deploy and Host

## About Hosting

S3-ObjectDeck is a Go application that serves both the API and the compiled React frontend from a single binary. It requires no database, no cache, and no additional services — just a container with port `8080` exposed.

The final Docker image weighs approximately **25 MB** (Alpine + Go binary + compiled Vite assets). Cold start time is under 100 ms.

## Why Deploy

- **Zero external dependencies** — single container, no Postgres, no Redis, nothing else.
- **Ultra-lightweight image** — ~25 MB, starts in under 100 ms.
- **Stateless** — scales horizontally with no additional configuration.
- **Secure by design** — S3 credentials are never persisted on the server.
- **Universal** — connects to any S3-compatible provider without changing a line of code.

## Common Use Cases

- Review and manage invoices or receipts stored in S3.
- Browse bucket contents without needing the AWS console or CLI.
- Preview images and PDFs directly from cloud storage.
- Manage files in Railway, Cloudflare R2, or MinIO buckets from a clean web UI.
- Replace or delete files in development and staging environments.

## Dependencies for

This template has no dependencies on other services — it can be deployed completely standalone.

To connect it to **Railway S3 (Object Storage)**, create that service in the same Railway project and use the credentials Railway generates automatically in the app's Settings screen.

### Deployment Dependencies

| Dependency | Required | Description |
|---|---|---|
| Port `8080` | ✅ Yes | HTTP server port (configurable via `PORT`) |
| S3-compatible bucket | ✅ Yes | Any external S3 provider (not included in this template) |
| Database | ❌ No | Not used |
| Cache (Redis, etc.) | ❌ No | Not used |
| Persistent storage | ❌ No | Not used |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP server port |
| `MAX_UPLOAD_MB` | `100` | Maximum upload file size in MB |
| `LOG_LEVEL` | `info` | Log level: `debug` · `info` · `warn` · `error` |

# S3 Invoice Viewer

A lightweight S3-compatible storage browser built for internal invoice management. Supports Amazon S3, Cloudflare R2, MinIO, Backblaze B2, DigitalOcean Spaces, and any S3-compatible provider.

## Architecture

```
┌─────────────────────────────────────┐
│  Browser                            │
│  React 19 + Vite  (web/)            │
│  S3InvoiceViewer · FileDetailPanel  │
│  ExplorerScreen  · DashboardScreen  │
└────────────┬────────────────────────┘
             │  fetch /api/s3/*
             ▼
┌─────────────────────────────────────┐
│  Go API  (api/)                     │
│  net/http — standard library only   │
│  cmd/server  ·  internal/           │
│    config · domain · s3 · handler   │
│  AWS SDK v2 → any S3-compatible     │
└─────────────────────────────────────┘
```

In production, Go serves both the compiled React SPA and the API from a single binary on port `8080`.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v3, shadcn/ui |
| Backend | Go 1.22, `net/http` (stdlib only, no framework), AWS SDK v2 |
| Container | Docker multi-stage — final image ~25 MB |

## Project Structure

```
s3-invoice-viewer/
├── api/                          ← Go backend
│   ├── cmd/server/main.go        ← Entry point (wiring only)
│   └── internal/
│       ├── config/config.go      ← Env-var configuration
│       ├── domain/types.go       ← Core types (zero dependencies)
│       ├── s3/
│       │   ├── service.go        ← Service interface (contract)
│       │   ├── aws.go            ← AWS SDK v2 implementation
│       │   ├── client.go         ← S3 client factory + validation
│       │   └── classify.go       ← File type classification
│       └── handler/
│           ├── handler.go        ← Handler struct, router, helpers
│           ├── list.go           ← POST /api/s3/list
│           ├── object.go         ← POST /api/s3/object
│           ├── browse.go         ← POST /api/s3/browse
│           ├── upload.go         ← POST /api/s3/upload + replace
│           └── delete.go         ← POST /api/s3/delete
│
├── web/                          ← Vite React frontend
│   ├── src/
│   │   ├── types/s3.ts           ← Canonical TypeScript types
│   │   ├── hooks/
│   │   │   ├── useToast.ts       ← Toast notification state
│   │   │   └── useConnections.ts ← Saved connections + localStorage
│   │   ├── lib/
│   │   │   ├── format.ts         ← formatBytes, formatDate
│   │   │   ├── classify.tsx      ← typeLabel, typeIcon
│   │   │   ├── fuzzy.ts          ← Fuzzy search algorithm
│   │   │   └── utils.ts          ← cn() Tailwind helper
│   │   └── components/
│   │       ├── ui/               ← shadcn/ui base components
│   │       └── viewer/           ← Feature components
│   ├── vite.config.ts
│   └── package.json
│
├── design/                       ← UI design references (HTML mockups + PNGs)
├── scripts/
│   ├── dev.ps1                   ← Start both servers (Windows)
│   └── build.ps1                 ← Production build (Windows)
├── Dockerfile                    ← Multi-stage: Vite → Go → Alpine
├── .dockerignore
└── Makefile                      ← Unix build commands
```

## Prerequisites

- **Go** 1.22+
- **Node.js** 20+
- **Docker** (for container builds)

## Development

Start both servers, each in its own terminal:

```bash
# Terminal 1 — Go API on :8080
cd api
go run ./cmd/server/

# Terminal 2 — Vite dev server on :5173
cd web
npm run dev
```

**Windows shortcut:**
```powershell
.\scripts\dev.ps1   # opens both terminals automatically
```

Open **http://localhost:5173** — Vite proxies `/api/*` to Go automatically.

## Build

### Production binary + static files

```bash
# 1. Build frontend (outputs to api/static/)
cd web && npm run build

# 2. Build Go binary
cd api && go build -o server ./cmd/server/

# 3. Run
cd api && ./server   # serves http://localhost:8080
```

**Windows:**
```powershell
.\scripts\build.ps1
cd api && .\server.exe
```

### Docker
```bash
docker build -t s3-invoice-viewer .
docker run -p 8080:8080 s3-invoice-viewer
# open http://localhost:8080
```

## API Reference

All endpoints accept JSON. Credentials travel per-request — never stored server-side.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/s3/list` | List all objects under the configured prefix |
| `POST` | `/api/s3/object` | Stream a single object (image / PDF / any file) |
| `POST` | `/api/s3/browse` | List one directory level (folders + files) |
| `POST` | `/api/s3/upload` | Upload one or more new files |
| `POST` | `/api/s3/replace` | Replace an existing object at a given key |
| `POST` | `/api/s3/delete` | Delete an object |

All endpoints include a `connection` object in the request body:

```json
{
  "connection": {
    "accessKeyId": "...",
    "secretAccessKey": "...",
    "region": "us-east-1",
    "endpoint": "https://...",
    "bucket": "my-bucket",
    "prefix": "bills",
    "forcePathStyle": true
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `STATIC_DIR` | `./static` | Path to Vite build output |
| `MAX_UPLOAD_MB` | `100` | Maximum upload file size (MB) |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` |

## Supported S3 Providers

| Provider | Endpoint template | `forcePathStyle` |
|---|---|---|
| Amazon S3 | `https://s3.{region}.amazonaws.com` | `false` |
| Cloudflare R2 | `https://{account_id}.r2.cloudflarestorage.com` | `true` |
| MinIO | `https://your-minio-instance.com` | `true` |
| Backblaze B2 | `https://s3.{region}.backblazeb2.com` | `true` |
| DigitalOcean Spaces | `https://{region}.digitaloceanspaces.com` | `false` |
| Wasabi | `https://s3.{region}.wasabisys.com` | `false` |
| Supabase Storage | `https://{ref}.supabase.co/storage/v1/s3` | `true` |
| Railway | (your Railway endpoint URL) | `true` |

## Deployment

Single Docker image, no database required. Deploy to any container platform:

```bash
docker build -t s3-invoice-viewer .
docker push your-registry/s3-invoice-viewer:latest
```

Set the `PORT` env var on your platform if different from `8080`. User credentials live in the browser's `localStorage` (obfuscated) — nothing is persisted on the server.

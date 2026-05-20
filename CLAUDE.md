# CLAUDE.md — Project Rules & Context

This file is read automatically by Claude Code. Follow all rules here without being asked.

## Project Overview

**S3 Invoice Viewer** — internal tool to browse S3-compatible object storage.
Monorepo: Go API (`api/`) + Vite React frontend (`web/`).

- **Backend:** Go 1.22, `net/http` stdlib only (no Gin, no Chi, no Echo)
- **Frontend:** React 19, Vite, TypeScript strict, Tailwind CSS v3, shadcn/ui
- **No database.** Credentials live in browser localStorage only.

---

## Critical Rules — Always Follow

### General
- Never introduce new external dependencies without asking the user first.
- Never use `any` in TypeScript — use proper types.
- Never commit secrets, `.env` files, or credentials.
- Never use `fmt.Println` in Go — use `slog` (structured logging).
- Run `go build ./...` after every Go change to verify compilation.
- Run `npx tsc -b --noEmit` after every TypeScript change to verify types.

### Go Backend
- All business logic goes in `internal/s3/` (service layer), **never in handlers**.
- Handlers only: parse request → call service → write response.
- Use `fmt.Errorf("context: %w", err)` for error wrapping — never swallow errors.
- The `domain` package must have **zero external imports** — only stdlib types.
- Never import `internal/handler` from `internal/s3` or `internal/domain` (no cycles).
- New S3 operations → add to the `Service` interface in `internal/s3/service.go` first, then implement in `internal/s3/aws.go`.
- New API endpoints → add route in `handler.Routes()` and create a new handler file.
- Configuration only via `internal/config/config.go` reading env vars — no hardcoded values.

### Frontend
- All shared types live in `web/src/types/s3.ts` — never redefine `S3Connection` or `ListedS3File` elsewhere.
- Utility functions belong in `web/src/lib/` (format, classify, fuzzy) — not inside components.
- State logic that persists or crosses components → extract to `web/src/hooks/`.
- The `"use client"` directive at the top of components is harmless in Vite — leave it.
- Import from `@/types/s3` for types, `@/lib/format` for formatting, `@/lib/classify` for icons.
- shadcn/ui components live in `web/src/components/ui/` — never modify them directly; extend via className props.
- Tailwind custom colors all start with `od-` (e.g. `od-primary`, `od-surface-low`). Use these, not arbitrary hex values.

---

## Architecture

```
cmd/server/main.go
  └── config.Load()         → env vars
  └── s3.New()              → Service interface (AWS impl)
  └── handler.New(svc, cfg) → HTTP handlers
  └── h.Routes()            → http.ServeMux

internal/domain/types.go    ← zero dependencies, pure types
internal/s3/service.go      ← interface definition
internal/s3/aws.go          ← AWS SDK v2 implementation
internal/handler/handler.go ← Handler struct, router, static serving
```

**Dependency flow (no cycles):**
```
cmd → handler → s3 (interface) → domain
            ↓              ↓
          config          domain
```

---

## Layer Responsibilities

| Layer | Responsibility | Must NOT |
|---|---|---|
| `domain` | Pure data types | Import any external package |
| `s3/service.go` | Define the contract (interface + option/result types) | Contain AWS SDK code |
| `s3/aws.go` | AWS SDK operations | Know about HTTP or handlers |
| `handler` | HTTP parsing + response writing | Contain S3 or business logic |
| `config` | Read env vars | Default to production-unsafe values |

---

## File Naming Conventions

### Go
- One file per handler: `list.go`, `object.go`, `browse.go`, `upload.go`, `delete.go`
- Shared helpers in the same package go in `handler.go` or `io.go`
- Test files: `foo_test.go` in the same package

### TypeScript / React
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities/types: `kebab-case.ts` or `camelCase.ts`
- Screens extracted from S3InvoiceViewer → `components/viewer/screens/`

---

## Common Commands

```bash
# Go
cd api && go run ./cmd/server/       # dev server :8080
cd api && go build ./...             # verify compilation
cd api && go test ./...              # run tests
cd api && go vet ./...               # linter

# Frontend
cd web && npm run dev                 # Vite dev server :5173
cd web && npm run build              # production build → api/static/
cd web && npx tsc -b --noEmit        # type check

# Docker
docker build -t s3-invoice-viewer .
docker run -p 8080:8080 s3-invoice-viewer

# Windows all-in-one
.\scripts\dev.ps1                    # start both servers
.\scripts\build.ps1                  # full production build
```

---

## Adding a New API Endpoint

1. Add method to `Service` interface in `internal/s3/service.go`
2. Implement in `internal/s3/aws.go`
3. Create `internal/handler/<name>.go` with the handler method
4. Register route in `handler.Routes()` in `internal/handler/handler.go`
5. Add API call in the frontend (`web/src/components/viewer/S3InvoiceViewer.tsx`)

---

## Adding a New Screen (Frontend)

1. Add the screen name to `Screen` type in `web/src/types/s3.ts`
2. Add `NavItem` in the `Sidebar` component
3. Add the title in `TopBar`
4. Add the conditional render in the main return of `S3InvoiceViewer`
5. Create the screen component in `web/src/components/viewer/`

---

## What NOT to Do

- Do not use `net/http/httptest` mocks in production code paths
- Do not add CSS files beyond `web/src/index.css` — use Tailwind utilities
- Do not use `console.log` in production React code — use the toast system
- Do not modify files in `web/src/components/ui/` — these are shadcn base components
- Do not add a web framework (Gin, Chi, Fiber) to Go — `net/http` is intentional
- Do not use `next/image`, `next/link`, or any Next.js API — this is a Vite project
- Do not store credentials anywhere server-side (no DB, no files, no env vars for user creds)

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| `net/http` only, no framework | Binary size, zero dependencies, Go stdlib is sufficient for 6 endpoints |
| `Service` interface for S3 | Testable, swappable (could replace AWS SDK with MinIO SDK) |
| Vite instead of Next.js | SPA only, no SSR needed, smaller Docker image (~25 MB vs ~180 MB) |
| Per-request S3 client creation | Stateless, no credential caching issues, safe for multi-user |
| localStorage for credentials | No backend persistence, simpler deployment, user controls their own data |
| `domain` package with zero imports | Force pure data types, prevent accidental coupling |

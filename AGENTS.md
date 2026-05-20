# AGENTS.md — AI Agent Guidelines

Guidelines for AI coding agents (Claude Code, Copilot, Cursor, Codeium, etc.) working on this project.

---

## What This Project Is

**S3 Invoice Viewer** — an internal S3 storage browser.
- `api/` → Go 1.22 HTTP server (no framework, stdlib only)
- `web/` → React 19 + Vite SPA (TypeScript strict)
- Single Docker image, no database, ~25 MB final size

---

## Before Making Any Change

1. **Read the affected files first.** Never edit blindly.
2. **Understand the layer.** Changes to `internal/domain` must stay dependency-free. Changes to `internal/handler` must not contain business logic.
3. **Check compilation** after every Go change: `cd api && go build ./...`
4. **Check types** after every TypeScript change: `cd web && npx tsc -b --noEmit`

---

## Repository Map

```
api/
  cmd/server/main.go              ← wiring: config + service + handler
  internal/config/config.go       ← env vars → Config struct
  internal/domain/types.go        ← S3Connection, ListedFile, FolderEntry, FileType
  internal/s3/service.go          ← Service interface + option/result types
  internal/s3/aws.go              ← AWS SDK v2 implementation of Service
  internal/s3/client.go           ← newClient() factory
  internal/s3/classify.go         ← classifyKey(), normalizePrefix()
  internal/handler/handler.go     ← Handler struct, Routes(), static serving, helpers
  internal/handler/list.go        ← POST /api/s3/list
  internal/handler/object.go      ← POST /api/s3/object
  internal/handler/browse.go      ← POST /api/s3/browse
  internal/handler/upload.go      ← POST /api/s3/upload + replace
  internal/handler/delete.go      ← POST /api/s3/delete

web/src/
  types/s3.ts                     ← ALL shared TypeScript types (source of truth)
  hooks/useToast.ts               ← Toast notification state hook
  hooks/useConnections.ts         ← Saved connections + localStorage logic
  lib/format.ts                   ← formatBytes, formatDate, formatDateShort
  lib/classify.tsx                ← typeLabel, typeIcon (JSX)
  lib/fuzzy.ts                    ← fuzzyScore, normalizeText
  lib/utils.ts                    ← cn() Tailwind class merger
  lib/s3.ts                       ← Re-exports from @/types/s3 (compat shim)
  components/ui/                  ← shadcn base components (do not edit)
  components/viewer/              ← S3InvoiceViewer, FileDetailPanel, ToastStack
```

---

## Go Conventions

```go
// ✅ Correct — return error, log at handler boundary
func (a *awsService) Delete(ctx context.Context, conn domain.S3Connection, key string) error {
    _, err = client.DeleteObject(ctx, ...)
    if err != nil {
        return fmt.Errorf("DeleteObject: %w", err)  // wrap with context
    }
    return nil
}

// ✅ Correct — handler logs and writes HTTP response
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
    if err := h.s3.Delete(r.Context(), req.Connection, req.Key); err != nil {
        h.log.Error("delete failed", "key", req.Key, "err", err)
        jsonError(w, err.Error(), http.StatusBadRequest)
        return
    }
    jsonOK(w, map[string]bool{"ok": true})
}

// ❌ Wrong — business logic in handler
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
    client := s3.NewFromConfig(...)  // NO — belongs in s3/aws.go
    client.DeleteObject(...)
}
```

**Import order** (goimports enforced):
1. Standard library
2. Blank line
3. External packages (`github.com/aws/...`)
4. Blank line
5. Internal packages (`s3invoiceapi/internal/...`)

---

## TypeScript / React Conventions

```tsx
// ✅ Correct — import types from canonical source
import type { S3Connection, ListedS3File } from "@/types/s3";
import { formatBytes, formatDate } from "@/lib/format";
import { typeIcon, typeLabel } from "@/lib/classify";

// ✅ Correct — custom hook for reusable state
const { toasts, addToast, dismissToast } = useToast();
const { savedConnections, activeConnectionId, activate } = useConnections();

// ❌ Wrong — redefining types that already exist in @/types/s3
type S3Connection = { ... };  // NO — already in types/s3.ts

// ❌ Wrong — formatting logic in a component
<p>{(bytes / 1024 / 1024).toFixed(1)} MB</p>   // NO — use formatBytes()
```

**Tailwind colors to use** (defined in `web/tailwind.config.ts`):
- Text: `text-od-text`, `text-od-text-muted`, `text-od-outline`
- Backgrounds: `bg-od-surface-low`, `bg-od-surface-high`, `bg-od-surface-container`
- Primary: `text-od-primary`, `bg-od-primary`, `bg-od-secondary-container`
- Borders: `border-od-outline-variant`
- Error: `text-od-error`, `bg-od-error-container`

---

## API Contract

All `/api/s3/*` endpoints share the same `connection` shape:

```typescript
// Matches Go's domain.S3Connection exactly
type S3Connection = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
};
```

Frontend sends credentials per-request. The Go server creates a fresh S3 client each time — no credential caching, no session state.

---

## Dependency Rules (strictly enforced)

```
cmd/server  →  handler  →  s3 (via interface)  →  domain
               handler  →  config
               handler  →  domain
               s3       →  domain
               s3       →  config  (only client.go)
```

**Never:**
- `domain` importing anything external
- `s3` importing `handler`
- `handler` importing AWS SDK directly

---

## When to Add Files vs Edit Existing

| Scenario | Action |
|---|---|
| New S3 operation | Add to `Service` interface → implement in `aws.go` → new `handler/<name>.go` |
| New UI screen | New file in `components/viewer/` → add to `Screen` type in `types/s3.ts` |
| New reusable state logic | New file in `hooks/use<Name>.ts` |
| New formatting/utility | Add function to existing `lib/*.ts` file |
| New base UI component | Run `npx shadcn add <component>` in `web/` — never write manually |

---

## Testing Approach

- Go: table-driven tests (`foo_test.go`, same package)
- Mock the `s3.Service` interface — never mock the AWS SDK directly
- Frontend: component tests with React Testing Library (not yet set up — ask before adding)

---

## Out of Scope (do not implement without explicit request)

- Authentication / authorization
- Multi-tenancy
- Server-side session storage
- WebSockets / real-time updates
- Dark mode
- Mobile-specific layouts
- Folder creation / renaming
- S3 pre-signed URLs (unless asked)

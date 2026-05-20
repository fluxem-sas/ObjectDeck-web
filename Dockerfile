# ── Stage 1: Build Vite frontend ─────────────────────────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /web

COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ .
# Output goes to ../api/static (as configured in vite.config.ts)
# We override here so it goes to /web/dist inside the container
RUN npx vite build --outDir /web/dist

# ── Stage 2: Build Go API ─────────────────────────────────────────────────────
FROM golang:1.22-alpine AS api-builder
WORKDIR /api

COPY api/go.mod api/go.sum ./
RUN go mod download

COPY api/ .

# Copy the Vite build into api/static so the binary can serve it
COPY --from=web-builder /web/dist ./static

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server/

# ── Stage 3: Minimal production image (~25 MB) ────────────────────────────────
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=api-builder /api/server ./server
COPY --from=api-builder /api/static ./static

ENV PORT=8080

EXPOSE 8080

CMD ["./server"]

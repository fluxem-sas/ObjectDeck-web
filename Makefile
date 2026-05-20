.PHONY: dev dev-api dev-web migrate-components install build docker-build docker-run

# ── Development ───────────────────────────────────────────────────────────────

# Run both servers for local development (requires: make migrate-components first)
dev:
	@echo "Starting Go API on :8080 and Vite on :5173"
	@$(MAKE) -j2 dev-api dev-web

dev-api:
	@cd api && go run .

dev-web:
	@cd web && npm run dev

# ── Setup ─────────────────────────────────────────────────────────────────────

# Install web dependencies
install:
	cd web && npm install

# Install Go dependencies
install-go:
	cd api && go mod tidy

# Migrate React components from Next.js → Vite (run once)
migrate-components:
	@echo "Copying components from Next.js project to Vite..."
	@mkdir -p web/src/components/ui
	@mkdir -p web/src/components/viewer
	@cp -r components/ui/. web/src/components/ui/
	@cp components/viewer/S3InvoiceViewer.tsx  web/src/components/viewer/
	@cp components/viewer/FileDetailPanel.tsx  web/src/components/viewer/
	@cp components/viewer/ToastStack.tsx       web/src/components/viewer/
	@echo ""
	@echo "Done. Components copied. The 'use client' directives are harmless in Vite."
	@echo ""
	@echo "IMPORTANT: In web/src/components/viewer/S3InvoiceViewer.tsx:"
	@echo "  Replace: connection as import(\"@/lib/s3\").S3Connection"
	@echo "  With:    connection"
	@echo ""
	@echo "Next step: make install && make dev"

# ── Build ─────────────────────────────────────────────────────────────────────

# Build Vite frontend (output → api/static/)
build-web:
	cd web && npm run build

# Build Go API binary
build-api:
	cd api && go build -o server ./cmd/server/

# Full production build (web first, then Go)
build: build-web build-api

# ── Docker ────────────────────────────────────────────────────────────────────

docker-build:
	docker build -t s3-invoice-viewer:latest .

docker-run:
	docker run -p 8080:8080 s3-invoice-viewer:latest

docker-push:
	docker build -t $(REGISTRY)/s3-invoice-viewer:latest .
	docker push $(REGISTRY)/s3-invoice-viewer:latest

# ── Helpers ───────────────────────────────────────────────────────────────────

# Show current image size after build
docker-size:
	docker image inspect s3-invoice-viewer:latest --format='{{.Size}}' | \
		awk '{printf "Image size: %.1f MB\n", $$1/1024/1024}'

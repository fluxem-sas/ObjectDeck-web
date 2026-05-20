package main

import (
	"log/slog"
	"net/http"
	"os"

	"s3invoiceapi/internal/config"
	"s3invoiceapi/internal/handler"
	"s3invoiceapi/internal/s3"
)

func main() {
	cfg := config.Load()

	log := newLogger(cfg.LogLevel)
	slog.SetDefault(log)

	svc := s3.New()
	h := handler.New(svc, cfg, log)

	mux := h.Routes()

	log.Info("server starting", "port", cfg.Port, "static", cfg.StaticDir)

	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Error("server error", "err", err)
		os.Exit(1)
	}
}

func newLogger(level string) *slog.Logger {
	var l slog.Level
	switch level {
	case "debug":
		l = slog.LevelDebug
	case "warn":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	default:
		l = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: l}))
}

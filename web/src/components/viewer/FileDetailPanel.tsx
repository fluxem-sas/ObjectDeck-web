"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File,
  FileImage,
  FileText,
  Loader2,
  Maximize2,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ListedS3File, S3Connection } from "@/lib/s3";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

export type FileDetailPanelProps = {
  file: ListedS3File | null;
  open: boolean;
  connection: S3Connection;
  onClose: () => void;
  onReplace: (file: ListedS3File) => void;
  onDelete: (file: ListedS3File) => void;
  onToast: (type: "ok" | "error", text: string) => void;
};

export function FileDetailPanel({
  file,
  open,
  connection,
  onClose,
  onReplace,
  onDelete,
  onToast
}: FileDetailPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  // Close lightbox with Escape key
  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  useEffect(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setPreviewUrl(null);

    if (!file || !open || (file.type !== "image" && file.type !== "pdf")) return;

    setPreviewLoading(true);
    let cancelled = false;

    fetch("/api/s3/object", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection, key: file.key })
    })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el archivo");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) onToast("error", "No se pudo cargar la vista previa");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file?.key, open]);

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  function copyKey() {
    if (!file) return;
    const text = file.key;

    const execFallback = () => {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        onToast("error", "No se pudo copiar al portapapeles");
      }
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(execFallback);
    } else {
      execFallback();
    }
  }

  async function download() {
    if (!file) return;
    setDownloading(true);
    try {
      let url = previewUrl;
      let shouldRevoke = false;

      if (!url) {
        const res = await fetch("/api/s3/object", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection, key: file.key })
        });
        if (!res.ok) throw new Error("No se pudo descargar");
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = file.fileName;
      a.click();

      if (shouldRevoke) setTimeout(() => URL.revokeObjectURL(url!), 5000);
    } catch {
      onToast("error", "Error al descargar el archivo");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-l border-od-outline-variant bg-white transition-[width] duration-300 ${
        open ? "w-[320px]" : "w-0 overflow-hidden"
      }`}
    >
      {open && file && (
        <>
          <div className="flex items-center justify-between border-b border-od-outline-variant px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-od-outline">
              Object Details
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="grid size-6 place-items-center rounded-md text-od-outline transition-colors hover:text-od-error"
              aria-label="Cerrar panel"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-5 p-4">
              {/* Preview */}
              <div className="group relative aspect-video w-full overflow-hidden rounded-xl border border-od-outline-variant bg-od-surface-container">
                {previewLoading && <Skeleton className="h-full w-full rounded-none" />}

                {!previewLoading && file.type === "image" && previewUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="h-full w-full object-cover"
                      src={previewUrl}
                      alt={file.fileName}
                    />
                    {/* Fullscreen trigger overlay */}
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/30 focus:outline-none"
                      aria-label="Ver imagen completa"
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-white/0 opacity-0 shadow-lg transition-all group-hover:bg-white/90 group-hover:opacity-100">
                        <Maximize2 className="size-4 text-od-text" aria-hidden />
                      </span>
                    </button>
                  </>
                )}

                {!previewLoading && file.type === "pdf" && previewUrl && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                    <FileText className="size-10 text-od-outline" aria-hidden />
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-od-primary px-4 py-2 text-sm font-medium text-white hover:bg-od-primary-strong transition-colors"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      Abrir PDF
                    </a>
                  </div>
                )}

                {!previewLoading && !previewUrl && (
                  <div className="flex h-full items-center justify-center text-od-outline">
                    {file.type === "image" ? (
                      <FileImage className="size-10" aria-hidden />
                    ) : file.type === "pdf" ? (
                      <FileText className="size-10" aria-hidden />
                    ) : (
                      <File className="size-10" aria-hidden />
                    )}
                  </div>
                )}
              </div>

              {/* Filename */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-od-outline">
                  Nombre
                </p>
                <p className="mt-1 break-all text-base font-semibold leading-tight text-od-text">
                  {file.fileName}
                </p>
              </div>

              {/* S3 Key */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-od-outline">
                  S3 Key
                </p>
                <div className="mt-1 flex items-start gap-2 rounded-lg border border-od-outline-variant bg-od-surface-low p-3">
                  <span className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-od-text-muted">
                    {file.key}
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={
                      <button
                        type="button"
                        onClick={copyKey}
                        className="mt-0.5 shrink-0 text-od-outline transition-colors hover:text-od-primary"
                        aria-label="Copiar key"
                      >
                        {copied ? (
                          <Check className="size-3.5 text-green-500" aria-hidden />
                        ) : (
                          <Copy className="size-3.5" aria-hidden />
                        )}
                      </button>
                    } />
                    <TooltipContent>{copied ? "¡Copiado!" : "Copiar key"}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-od-outline">
                    Tamaño
                  </p>
                  <p className="mt-1 text-sm font-medium text-od-text">{formatBytes(file.size)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-od-outline">
                    Tipo
                  </p>
                  <Badge
                    className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      file.type === "image"
                        ? "bg-od-secondary-container text-od-primary hover:bg-od-secondary-container"
                        : "bg-od-surface-high text-od-text-muted hover:bg-od-surface-high"
                    }`}
                  >
                    {file.extension ? `.${file.extension}` : file.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-od-outline">
                    Modificado
                  </p>
                  <p className="mt-1 text-xs text-od-text-muted">{formatDate(file.lastModified)}</p>
                </div>
                {file.etag && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-od-outline">
                      ETag
                    </p>
                    <p className="mt-1 font-mono text-xs text-od-text-muted">
                      {file.etag.slice(0, 8)}…
                    </p>
                  </div>
                )}
              </div>

              <Separator className="bg-od-outline-variant/50" />

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full justify-center gap-2 bg-od-primary text-white hover:bg-od-primary-strong"
                  onClick={download}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-4" aria-hidden />
                  )}
                  Descargar
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-center gap-2 border-od-outline-variant"
                  onClick={() => onReplace(file)}
                >
                  <Upload className="size-4" aria-hidden />
                  Reemplazar
                </Button>
                <Button
                  variant="outline"
                  className="mt-2 w-full justify-center gap-2 border-od-error/30 text-od-error hover:bg-od-error/5 hover:text-od-error"
                  onClick={() => onDelete(file)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Eliminar objeto
                </Button>
              </div>
            </div>
          </ScrollArea>
        </>
      )}

      {open && !file && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <FileImage className="size-9 text-od-outline" aria-hidden />
          <p className="text-sm text-od-text-muted">
            Selecciona un archivo para ver sus detalles
          </p>
        </div>
      )}

      {/* Lightbox fullscreen overlay */}
      {lightboxOpen && previewUrl && file?.type === "image" && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Stop propagation so clicking the image itself doesn't close */}
          <div
            className="relative flex max-h-screen max-w-screen-2xl items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={file.fileName}
              className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
            />

            {/* File name caption */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 backdrop-blur-sm">
              <p className="max-w-xs truncate text-center text-xs text-white/80">{file.fileName}</p>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
            aria-label="Cerrar vista completa"
          >
            <X className="size-5" aria-hidden />
          </button>

          {/* ESC hint */}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40">
            Pulsa ESC o haz click fuera para cerrar
          </p>
        </div>
      )}
    </aside>
  );
}

"use client";

import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  GalleryHorizontalEnd,
  Grid3X3,
  HardDrive,
  HelpCircle,
  Home,
  ImageIcon,
  LayoutDashboard,
  List,
  Loader2,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Zap,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileDetailPanel } from "./FileDetailPanel";
import { ToastStack, type Toast } from "./ToastStack";

// ─── Types ────────────────────────────────────────────────────────────────────

type S3Connection = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
};

type ListedS3File = {
  key: string;
  fileName: string;
  extension: string;
  type: "image" | "pdf" | "other";
  size: number;
  lastModified: string | null;
  etag: string | null;
};

type SortField = "score" | "lastModified" | "size" | "fileName";
type TypeFilter = "all" | ListedS3File["type"];
type Screen = "dashboard" | "explorer" | "files" | "images" | "settings";
type ConnectionStatus = "untested" | "connected" | "error";

type SavedConnection = {
  id: string;
  name: string;
  connection: S3Connection;
  createdAt: string;
  lastUsed: string | null;
};

const emptyConnection: S3Connection = {
  accessKeyId: "",
  secretAccessKey: "",
  region: "us-east-1",
  endpoint: "",
  bucket: "",
  prefix: "bills",
  forcePathStyle: true
};

const STORAGE_KEY = "s3iv_connection";       // legacy single-connection key
const CONNECTIONS_KEY = "s3iv_connections";  // new multi-connection key
const ACTIVE_KEY = "s3iv_active_id";        // active connection ID

// ─── Thumbnail cache (module-level, persists for session) ─────────────────────
const thumbCache = new Map<string, string>();

// ─── Utility functions ────────────────────────────────────────────────────────

function loadSavedConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    if (!raw) return [];
    return JSON.parse(atob(raw)) as SavedConnection[];
  } catch { return []; }
}

function persistSavedConnections(list: SavedConnection[]) {
  try { localStorage.setItem(CONNECTIONS_KEY, btoa(JSON.stringify(list))); } catch {}
}

function loadActiveConnectionId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

function persistActiveConnectionId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

function migrateLegacyConnection(existing: SavedConnection[]): SavedConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return existing;
    if (existing.length > 0) { localStorage.removeItem(STORAGE_KEY); return existing; }
    const conn = { ...emptyConnection, ...JSON.parse(atob(raw)) };
    if (!isConnectionValid(conn)) return existing;
    const migrated: SavedConnection = {
      id: crypto.randomUUID(),
      name: conn.bucket || "Conexión importada",
      connection: conn,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    localStorage.removeItem(STORAGE_KEY);
    return [migrated];
  } catch { return existing; }
}

function isConnectionValid(conn: S3Connection) {
  return Boolean(
    conn.accessKeyId.trim() &&
    conn.secretAccessKey.trim() &&
    conn.region.trim() &&
    conn.endpoint.trim() &&
    conn.bucket.trim()
  );
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyScore(query: string, target: string) {
  const q = normalizeText(query);
  const t = normalizeText(target);
  if (!q) return 1;
  if (!t) return 0;
  if (t.includes(q)) return 1;
  let queryIndex = 0, streak = 0, score = 0;
  for (let i = 0; i < t.length && queryIndex < q.length; i += 1) {
    if (t[i] === q[queryIndex]) { queryIndex += 1; streak += 1; score += 2 + Math.min(streak, 4); }
    else if (t[i] !== " ") { streak = 0; score -= 0.08; }
  }
  if (queryIndex < q.length) return 0;
  return Math.max(0, Math.min(0.98, score / (q.length * 6 + t.length * 0.08)));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function typeLabel(type: ListedS3File["type"]) {
  if (type === "image") return "Imagen";
  if (type === "pdf") return "PDF";
  return "Otro";
}

function typeIcon(type: ListedS3File["type"], className = "size-4") {
  if (type === "image") return <FileImage className={className} aria-hidden />;
  if (type === "pdf") return <FileText className={className} aria-hidden />;
  return <File className={className} aria-hidden />;
}

function getFileTimestamp(file: ListedS3File) {
  if (!file.lastModified) return 0;
  const ts = new Date(file.lastModified).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function parseDateBoundary(value: string, edge: "start" | "end") {
  if (!value) return null;
  const suffix = edge === "start" ? "T00:00:00" : "T23:59:59.999";
  const ts = new Date(`${value}${suffix}`).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function parseSizeMb(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n * 1024 * 1024 : null;
}

function normalizeListedFile(file: ListedS3File): ListedS3File {
  const key = String(file.key ?? "");
  const fileName = String(file.fileName || key.split("/").pop() || key);
  const extension = String(file.extension || fileName.split(".").pop() || "").toLowerCase();
  const type = (["image", "pdf", "other"] as const).includes(file.type as "image" | "pdf" | "other") ? file.type : "other";
  return { ...file, key, fileName, extension, type, size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0, lastModified: file.lastModified ?? null, etag: file.etag ?? null };
}

function mergeAndSortByRecent(current: ListedS3File[], incoming: ListedS3File[], reset: boolean) {
  const byKey = new Map<string, ListedS3File>();
  for (const f of [...(reset ? [] : current), ...incoming].map(normalizeListedFile)) {
    if (f.key) byKey.set(f.key, f);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const d = getFileTimestamp(b) - getFileTimestamp(a);
    return d !== 0 ? d : b.key.localeCompare(a.key);
  });
}

function NativeSelect({ value, onChange, children, className }: { value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string; }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-9 rounded-lg border border-od-outline-variant bg-white px-3 text-sm text-od-text outline-none transition-colors focus:border-od-primary focus:ring-2 focus:ring-od-primary/10 ${className ?? ""}`}>
      {children}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function S3InvoiceViewer() {
  const [screen, setScreen] = useState<Screen>("files");
  const [connection, setConnection] = useState<S3Connection>(emptyConnection);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("untested");
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

  const [files, setFiles] = useState<ListedS3File[]>([]);
  const [selectedFile, setSelectedFile] = useState<ListedS3File | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [extensionFilter, setExtensionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minSizeMb, setMinSizeMb] = useState("");
  const [maxSizeMb, setMaxSizeMb] = useState("");
  const [sortField, setSortField] = useState<SortField>("lastModified");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<ListedS3File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // ── Toast helpers ─────────────────────────────────────────────────────────
  const addToast = useCallback((type: Toast["type"], text: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Hydration: load saved connections from localStorage on client mount ──
  useEffect(() => {
    let connections = loadSavedConnections();
    connections = migrateLegacyConnection(connections);
    if (connections.length > 0) persistSavedConnections(connections);
    setSavedConnections(connections);

    const activeId = loadActiveConnectionId();
    const active = connections.find((c) => c.id === activeId) ?? connections[0] ?? null;
    if (active) {
      setActiveConnectionId(active.id);
      persistActiveConnectionId(active.id);
      if (isConnectionValid(active.connection)) {
        setConnection(active.connection);
        listFiles(true, true, active.connection);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup thumbnail cache on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      thumbCache.forEach((url) => URL.revokeObjectURL(url));
      thumbCache.clear();
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

      if (event.key === "Escape" && detailPanelOpen) {
        setDetailPanelOpen(false);
        setSelectedFile(null);
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && detailPanelOpen && selectedFile) {
        const idx = paginatedFiles.findIndex(({ file }) => file.key === selectedFile.key);
        if (idx === -1) return;
        const next = event.key === "ArrowDown" ? paginatedFiles[idx + 1] : paginatedFiles[idx - 1];
        if (next) { setSelectedFile(next.file); event.preventDefault(); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailPanelOpen, selectedFile]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const extensions = useMemo(() => Array.from(new Set(files.map((f) => f.extension).filter(Boolean))).sort(), [files]);
  const imageExtensions = useMemo(() => Array.from(new Set(files.filter((f) => f.type === "image").map((f) => f.extension).filter(Boolean))).sort(), [files]);

  const filteredFiles = useMemo(() => {
    const search = query.trim();
    const effectiveTypeFilter: TypeFilter = screen === "images" ? "image" : typeFilter;
    const minBytes = parseSizeMb(minSizeMb);
    const maxBytes = parseSizeMb(maxSizeMb);
    const fromTs = parseDateBoundary(fromDate, "start");
    const toTs = parseDateBoundary(toDate, "end");

    const scored = files.map((file) => ({ file, score: fuzzyScore(search, `${file.fileName} ${file.key} ${file.extension}`) })).filter(({ file, score }) => {
      if (search && score <= 0) return false;
      if (effectiveTypeFilter !== "all" && file.type !== effectiveTypeFilter) return false;
      if (extensionFilter && file.extension !== extensionFilter) return false;
      if (minBytes !== null && file.size < minBytes) return false;
      if (maxBytes !== null && file.size > maxBytes) return false;
      const ts = getFileTimestamp(file);
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      return true;
    });

    scored.sort((a, b) => {
      if (sortField === "score") { const d = b.score - a.score; return d !== 0 ? d : getFileTimestamp(b.file) - getFileTimestamp(a.file); }
      if (sortField === "size") { const d = b.file.size - a.file.size; return d !== 0 ? d : getFileTimestamp(b.file) - getFileTimestamp(a.file); }
      if (sortField === "fileName") return a.file.fileName.localeCompare(b.file.fileName, "es", { numeric: true, sensitivity: "base" });
      const d = getFileTimestamp(b.file) - getFileTimestamp(a.file);
      return d !== 0 ? d : b.file.key.localeCompare(a.file.key);
    });
    return scored;
  }, [files, query, screen, typeFilter, extensionFilter, minSizeMb, maxSizeMb, fromDate, toDate, sortField]);

  const imageFiles = files.filter((f) => f.type === "image");
  const pdfCount = files.filter((f) => f.type === "pdf").length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedFiles = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, pageSize, safeCurrentPage]);

  const activeFilterCount = [typeFilter !== "all", extensionFilter, fromDate, toDate, minSizeMb, maxSizeMb].filter(Boolean).length;

  useEffect(() => { setCurrentPage(1); }, [query, screen, typeFilter, extensionFilter, minSizeMb, maxSizeMb, fromDate, toDate, sortField, pageSize]);

  // ── Connection helpers ────────────────────────────────────────────────────
  function updateConnection<K extends keyof S3Connection>(key: K, value: S3Connection[K]) {
    setConnection((current) => {
      const updated = { ...current, [key]: value };
      // Also auto-update the active saved connection so changes persist immediately
      if (activeConnectionId) {
        setSavedConnections((prev) => {
          const next = prev.map((c) => c.id === activeConnectionId ? { ...c, connection: updated } : c);
          persistSavedConnections(next);
          return next;
        });
      }
      return updated;
    });
    setConnectionStatus("untested");
  }

  function saveCurrentAsNew() {
    const name = window.prompt("Nombre para esta conexión:", connection.bucket || "Nueva conexión");
    if (!name?.trim()) return;
    const newEntry: SavedConnection = {
      id: crypto.randomUUID(),
      name: name.trim(),
      connection: { ...connection },
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    setSavedConnections((prev) => {
      const next = [...prev, newEntry];
      persistSavedConnections(next);
      return next;
    });
    setActiveConnectionId(newEntry.id);
    persistActiveConnectionId(newEntry.id);
    addToast("ok", `Conexión "${newEntry.name}" guardada`);
  }

  function activateSavedConnection(id: string) {
    const found = savedConnections.find((c) => c.id === id);
    if (!found) return;
    setConnection({ ...found.connection });
    setActiveConnectionId(id);
    setConnectionStatus("untested");
    setFiles([]);
    setSelectedFile(null);
    setDetailPanelOpen(false);
    persistActiveConnectionId(id);
    // Update lastUsed
    setSavedConnections((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, lastUsed: new Date().toISOString() } : c);
      persistSavedConnections(next);
      return next;
    });
    if (isConnectionValid(found.connection)) {
      listFiles(true, false, found.connection);
    }
    addToast("ok", `Conectado a "${found.name}"`);
  }

  function renameSavedConnection(id: string) {
    const found = savedConnections.find((c) => c.id === id);
    if (!found) return;
    const name = window.prompt("Nuevo nombre:", found.name);
    if (!name?.trim() || name.trim() === found.name) return;
    setSavedConnections((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, name: name.trim() } : c);
      persistSavedConnections(next);
      return next;
    });
    addToast("ok", `Renombrado a "${name.trim()}"`);
  }

  function deleteSavedConnection(id: string) {
    const found = savedConnections.find((c) => c.id === id);
    if (!found) return;
    if (!window.confirm(`¿Eliminar la conexión "${found.name}"?`)) return;
    setSavedConnections((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persistSavedConnections(next);
      return next;
    });
    if (activeConnectionId === id) {
      setActiveConnectionId(null);
      persistActiveConnectionId(null);
      setConnection(emptyConnection);
      setFiles([]);
    }
    addToast("ok", `Conexión "${found.name}" eliminada`);
  }

  async function testConnection() {
    setConnectionStatus("untested");
    try {
      const response = await fetch("/api/s3/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection, maxKeys: 1, loadAll: false })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Conexión fallida");
      }
      setConnectionStatus("connected");
      addToast("ok", "Conexión establecida correctamente");
    } catch (error) {
      setConnectionStatus("error");
      addToast("error", error instanceof Error ? error.message : "Error de conexión");
    }
  }

  function clearConnection() {
    if (!window.confirm("¿Desconectar el bucket actual? Las conexiones guardadas no se eliminarán.")) return;
    setConnection(emptyConnection);
    setActiveConnectionId(null);
    persistActiveConnectionId(null);
    setFiles([]);
    setConnectionStatus("untested");
    addToast("info", "Desconectado");
  }

  // ── File operations ───────────────────────────────────────────────────────
  async function listFiles(reset = true, silent = false, connOverride?: S3Connection) {
    const conn = connOverride ?? connection;
    setLoading(true);
    try {
      const response = await fetch("/api/s3/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection: conn, continuationToken: reset ? null : nextToken, maxKeys: 1000, loadAll: reset })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo listar el bucket");
      const listedFiles = Array.isArray(payload.files) ? payload.files : [];
      setFiles((current) => mergeAndSortByRecent(current, listedFiles, reset));
      setNextToken(payload.nextContinuationToken);
      setIsTruncated(payload.isTruncated);
      if (!silent) addToast("ok", reset ? `Se cargaron ${listedFiles.length} archivo(s)` : `Se agregaron ${listedFiles.length} archivo(s) más`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error listando archivos";
      if (!silent) addToast("error", msg);
      else addToast("info", "No se pudo reconectar automáticamente");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedFile(null);
    setDetailPanelOpen(false);
    await listFiles(true);
  }

  function openDetail(file: ListedS3File) {
    setSelectedFile(file);
    setDetailPanelOpen(true);
  }

  function requestReplace(file: ListedS3File) {
    replaceTargetRef.current = file;
    replaceInputRef.current?.click();
  }

  async function replaceSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    const replacement = event.target.files?.[0];
    const target = replaceTargetRef.current;
    event.target.value = "";
    if (!replacement || !target) return;
    setActionLoadingKey(target.key);
    try {
      const formData = new FormData();
      formData.append("connection", JSON.stringify(connection));
      formData.append("key", target.key);
      formData.append("file", replacement);
      const response = await fetch("/api/s3/replace", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo reemplazar el archivo");
      addToast("ok", `Archivo reemplazado: ${target.fileName}`);
      thumbCache.delete(target.key);
      await listFiles(true, true);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Error reemplazando archivo");
    } finally {
      setActionLoadingKey(null);
      replaceTargetRef.current = null;
    }
  }

  async function deleteFile(file: ListedS3File) {
    const confirmed = window.confirm(`¿Eliminar ${file.fileName} de S3? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setActionLoadingKey(file.key);
    try {
      const response = await fetch("/api/s3/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection, key: file.key }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo eliminar el archivo");
      setFiles((current) => current.filter((item) => item.key !== file.key));
      if (selectedFile?.key === file.key) { setSelectedFile(null); setDetailPanelOpen(false); }
      thumbCache.delete(file.key);
      addToast("ok", `Archivo eliminado: ${file.fileName}`);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Error eliminando archivo");
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    event.target.value = "";
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("connection", JSON.stringify(connection));
      formData.append("prefix", connection.prefix);
      for (const file of Array.from(fileList)) formData.append("file", file);
      const response = await fetch("/api/s3/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo subir el archivo");
      addToast("ok", `${fileList.length} archivo(s) subido(s) correctamente`);
      await listFiles(true, true);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Error subiendo archivos");
    } finally {
      setUploading(false);
    }
  }

  // ── Batch operations ──────────────────────────────────────────────────────
  function toggleKey(key: string, add: boolean) {
    setSelectedKeys((prev) => { const next = new Set(prev); add ? next.add(key) : next.delete(key); return next; });
  }

  function toggleAll(add: boolean) {
    if (add) { setSelectedKeys((prev) => { const next = new Set(prev); paginatedFiles.forEach(({ file }) => next.add(file.key)); return next; }); }
    else { setSelectedKeys((prev) => { const next = new Set(prev); paginatedFiles.forEach(({ file }) => next.delete(file.key)); return next; }); }
  }

  async function batchDelete() {
    const keys = Array.from(selectedKeys);
    const confirmed = window.confirm(`¿Eliminar ${keys.length} archivo(s) de S3? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setBatchLoading(true);
    let deleted = 0;
    for (const key of keys) {
      try {
        const response = await fetch("/api/s3/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection, key }) });
        if (response.ok) { deleted++; thumbCache.delete(key); }
      } catch { /* continue */ }
    }
    setFiles((current) => current.filter((f) => !selectedKeys.has(f.key)));
    if (selectedFile && selectedKeys.has(selectedFile.key)) { setSelectedFile(null); setDetailPanelOpen(false); }
    setSelectedKeys(new Set());
    setBatchLoading(false);
    addToast("ok", `${deleted} archivo(s) eliminado(s)`);
  }

  async function batchDownload() {
    const keys = Array.from(selectedKeys).slice(0, 5);
    if (selectedKeys.size > 5) addToast("info", "Solo se descargarán los primeros 5 archivos seleccionados");
    for (const key of keys) {
      const file = files.find((f) => f.key === key);
      if (!file) continue;
      try {
        const response = await fetch("/api/s3/object", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection, key }) });
        if (!response.ok) continue;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = file.fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        await new Promise((res) => setTimeout(res, 400));
      } catch { /* continue */ }
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  function clearFilters() {
    setQuery(""); setTypeFilter("all"); setExtensionFilter("");
    setFromDate(""); setToDate(""); setMinSizeMb(""); setMaxSizeMb("");
    setSortField("lastModified");
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="flex h-screen overflow-hidden bg-od-background text-od-text">
      <Sidebar
        screen={screen}
        activeConnection={savedConnections.find((c) => c.id === activeConnectionId) ?? null}
        connectionCount={savedConnections.length}
        onNavigate={(nextScreen) => {
          setScreen(nextScreen);
          if (nextScreen === "images") setTypeFilter("image");
          if (nextScreen === "files" && typeFilter === "image") setTypeFilter("all");
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <TopBar
          screen={screen}
          filesCount={files.length}
          loading={loading}
          uploading={uploading}
          savedConnections={savedConnections}
          activeConnectionId={activeConnectionId}
          onRefresh={() => listFiles(true)}
          onSettings={() => setScreen("settings")}
          onUpload={() => uploadInputRef.current?.click()}
          onActivate={activateSavedConnection}
        />

        {screen === "dashboard" ? (
          <DashboardScreen files={files} loading={loading} connection={connection} />
        ) : screen === "explorer" ? (
          <ExplorerScreen connection={connection} addToast={addToast} />
        ) : screen === "settings" ? (
          <SettingsScreen
            connection={connection}
            connectionStatus={connectionStatus}
            savedConnections={savedConnections}
            activeConnectionId={activeConnectionId}
            loading={loading}
            onSubmit={handleSubmit}
            onChange={updateConnection}
            onTest={testConnection}
            onDisconnect={clearConnection}
            onSaveAsNew={saveCurrentAsNew}
            onActivate={activateSavedConnection}
            onRename={renameSavedConnection}
            onDeleteSaved={deleteSavedConnection}
          />
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
              <WorkspaceHeader
                screen={screen}
                query={query}
                setQuery={(value) => {
                  setQuery(value);
                  if (value.trim()) setSortField("score");
                  if (!value.trim() && sortField === "score") setSortField("lastModified");
                }}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                extensionFilter={extensionFilter}
                setExtensionFilter={setExtensionFilter}
                extensions={extensions}
                imageExtensions={imageExtensions}
                sortField={sortField}
                setSortField={setSortField}
                fromDate={fromDate}
                setFromDate={setFromDate}
                toDate={toDate}
                setToDate={setToDate}
                minSizeMb={minSizeMb}
                setMinSizeMb={setMinSizeMb}
                maxSizeMb={maxSizeMb}
                setMaxSizeMb={setMaxSizeMb}
                clearFilters={clearFilters}
                filtersOpen={filtersOpen}
                setFiltersOpen={setFiltersOpen}
                activeFilterCount={activeFilterCount}
                onScreenChange={(nextScreen) => {
                  setScreen(nextScreen);
                  if (nextScreen === "images") setTypeFilter("image");
                  if (nextScreen === "files" && typeFilter === "image") setTypeFilter("all");
                }}
              />

              <StatsStrip
                total={files.length}
                visible={filteredFiles.length}
                images={imageFiles.length}
                pdf={pdfCount}
                totalSize={formatBytes(totalSize)}
              />

              {selectedKeys.size > 0 && (
                <BatchActionBar
                  count={selectedKeys.size}
                  loading={batchLoading}
                  onDelete={batchDelete}
                  onDownload={batchDownload}
                  onClear={() => setSelectedKeys(new Set())}
                />
              )}

              {screen === "images" ? (
                <ImagesGallery
                  loading={loading}
                  files={paginatedFiles}
                  selectedFile={selectedFile}
                  connection={connection}
                  onOpen={openDetail}
                  onReplace={requestReplace}
                  onDelete={deleteFile}
                  actionLoadingKey={actionLoadingKey}
                />
              ) : (
                <FilesTable
                  loading={loading}
                  files={paginatedFiles}
                  selectedFile={selectedFile}
                  selectedKeys={selectedKeys}
                  onOpen={openDetail}
                  onReplace={requestReplace}
                  onDelete={deleteFile}
                  onToggleKey={toggleKey}
                  onToggleAll={toggleAll}
                  actionLoadingKey={actionLoadingKey}
                />
              )}

              <PaginationControls
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredFiles.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />

              {isTruncated && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" onClick={() => listFiles(false)} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCcw aria-hidden />}
                    Cargar más
                  </Button>
                </div>
              )}
            </section>

            <FileDetailPanel
              file={selectedFile}
              open={detailPanelOpen}
              connection={connection}
              onClose={() => { setDetailPanelOpen(false); setSelectedFile(null); }}
              onReplace={requestReplace}
              onDelete={deleteFile}
              onToast={addToast}
            />

            <input ref={replaceInputRef} type="file" className="hidden" onChange={replaceSelectedFile} />
            <input ref={uploadInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          </div>
        )}
      </section>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ screen, activeConnection, connectionCount, onNavigate }: {
  screen: Screen;
  activeConnection: SavedConnection | null;
  connectionCount: number;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-od-outline-variant bg-od-surface-low px-4 py-6">
      <div className="mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-od-primary text-white">
            <Database className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-od-text">ObjectDeck</h1>
            <p className="text-[10px] text-od-outline">{connectionCount} conexión{connectionCount !== 1 ? "es" : ""} guardada{connectionCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
        {/* Active connection indicator */}
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-od-outline-variant bg-white px-3 py-2 text-left transition-colors hover:border-od-primary/40"
        >
          <span className={`size-2 shrink-0 rounded-full ${activeConnection ? "bg-green-500" : "bg-od-outline"}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-od-text">
              {activeConnection ? activeConnection.name : "Sin conexión"}
            </p>
            <p className="truncate font-mono text-[10px] text-od-text-muted">
              {activeConnection ? activeConnection.connection.bucket || "—" : "Configura en Settings"}
            </p>
          </div>
          <Settings className="size-3 shrink-0 text-od-outline" aria-hidden />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <NavItem icon={LayoutDashboard} label="Dashboard" active={screen === "dashboard"} onClick={() => onNavigate("dashboard")} />
        <NavItem icon={FolderTree} label="Explorer" active={screen === "explorer"} onClick={() => onNavigate("explorer")} />
        <NavItem icon={FolderOpen} label="Files" active={screen === "files"} onClick={() => onNavigate("files")} />
        <NavItem icon={ImageIcon} label="Images" active={screen === "images"} onClick={() => onNavigate("images")} />
        <NavItem icon={Settings} label="Settings" active={screen === "settings"} onClick={() => onNavigate("settings")} />
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <Button className="w-full justify-center gap-2 rounded-xl bg-od-primary py-2.5 text-white shadow-sm hover:bg-od-primary-strong">
          <Cloud className="size-4" aria-hidden />
          Upgrade Storage
        </Button>
        <div className="border-t border-od-outline-variant pt-3">
          <NavItem icon={HelpCircle} label="Support" disabled />
          <NavItem icon={LogOut} label="Sign Out" disabled />
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon: Icon, label, active, disabled, onClick }: { icon: React.ElementType; label: string; active?: boolean; disabled?: boolean; onClick?: () => void; }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-od-secondary-container font-semibold text-od-primary before:absolute before:left-0 before:h-5 before:w-1 before:rounded-full before:bg-od-primary" : "text-od-text-muted hover:bg-od-surface-high disabled:cursor-default disabled:opacity-55"}`}>
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({ screen, filesCount, loading, uploading, savedConnections, activeConnectionId, onRefresh, onSettings, onUpload, onActivate }: {
  screen: Screen; filesCount: number; loading: boolean; uploading: boolean;
  savedConnections: SavedConnection[]; activeConnectionId: string | null;
  onRefresh: () => void; onSettings: () => void; onUpload: () => void;
  onActivate: (id: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const title = screen === "dashboard" ? "Dashboard" : screen === "explorer" ? "Explorer" : screen === "images" ? "Images" : screen === "settings" ? "Settings" : "Files";
  const activeConn = savedConnections.find((c) => c.id === activeConnectionId) ?? null;

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-od-outline-variant bg-od-surface px-10">
      <div className="flex min-w-0 items-center gap-4">
        <h2 className="text-lg font-semibold text-od-primary">{title}</h2>
        <div className="hidden h-6 w-px bg-od-outline-variant md:block" />

        {/* Connection switcher */}
        <div ref={dropdownRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setDropdownOpen((p) => !p)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              dropdownOpen
                ? "border-od-primary bg-od-secondary-container text-od-primary"
                : "border-od-outline-variant bg-white text-od-text hover:border-od-primary/40"
            }`}
          >
            <span className={`size-2 shrink-0 rounded-full ${activeConn ? "bg-green-500" : "bg-od-outline"}`} />
            <span className="max-w-[180px] truncate font-medium">
              {activeConn ? activeConn.name : "Sin conexión"}
            </span>
            {activeConn && (
              <span className="truncate font-mono text-xs text-od-text-muted hidden lg:inline">
                {activeConn.connection.bucket}
              </span>
            )}
            <ChevronDown className={`size-3.5 shrink-0 text-od-outline transition-transform ${dropdownOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-od-outline-variant bg-white shadow-xl">
              {/* Header */}
              <div className="border-b border-od-outline-variant bg-od-surface-low px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-od-outline">Conexiones</p>
              </div>

              {savedConnections.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-od-text-muted">
                  No hay conexiones guardadas
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
                  {savedConnections.map((saved) => {
                    const isActive = saved.id === activeConnectionId;
                    return (
                      <button
                        key={saved.id}
                        type="button"
                        onClick={() => { if (!isActive) { onActivate(saved.id); } setDropdownOpen(false); }}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isActive
                            ? "bg-od-secondary-container/50 cursor-default"
                            : "hover:bg-od-surface-low"
                        }`}
                      >
                        <span className={`size-2 shrink-0 rounded-full ${isActive ? "bg-green-500" : "bg-od-outline"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-od-text">{saved.name}</p>
                            {isActive && (
                              <Badge className="rounded-full bg-green-100 px-1.5 py-0 text-[9px] font-bold text-green-700 hover:bg-green-100">
                                Activa
                              </Badge>
                            )}
                          </div>
                          <p className="truncate font-mono text-xs text-od-text-muted">
                            {saved.connection.bucket} · {saved.connection.region}
                          </p>
                        </div>
                        {!isActive && <Zap className="size-3.5 shrink-0 text-od-primary opacity-0 group-hover:opacity-100" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-od-outline-variant">
                <button
                  type="button"
                  onClick={() => { onSettings(); setDropdownOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-od-primary transition-colors hover:bg-od-secondary-container/40"
                >
                  <Settings className="size-3.5" aria-hidden />
                  Administrar conexiones
                </button>
              </div>
            </div>
          )}
        </div>

        <Badge className="bg-od-surface-low text-od-text-muted hover:bg-od-surface-low">{filesCount} objetos</Badge>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="rounded-full text-od-text-muted hover:text-od-primary" onClick={onRefresh} disabled={loading} />}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCcw className="size-4" aria-hidden />}
          </TooltipTrigger>
          <TooltipContent>Actualizar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="rounded-full text-od-text-muted hover:text-od-primary" />}>
            <Bell className="size-4" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Notificaciones</TooltipContent>
        </Tooltip>
        <Button className="rounded-lg bg-od-primary text-white shadow-sm hover:bg-od-primary-strong" onClick={onUpload} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          Upload
        </Button>
        <div className="size-8 shrink-0 overflow-hidden rounded-full border border-od-outline-variant bg-od-surface-high" />
      </div>
    </header>
  );
}

// ─── WorkspaceHeader ──────────────────────────────────────────────────────────

function WorkspaceHeader({
  screen, query, setQuery, typeFilter, setTypeFilter, extensionFilter, setExtensionFilter,
  extensions, imageExtensions, sortField, setSortField, fromDate, setFromDate, toDate, setToDate,
  minSizeMb, setMinSizeMb, maxSizeMb, setMaxSizeMb, clearFilters, filtersOpen, setFiltersOpen,
  activeFilterCount, onScreenChange
}: {
  screen: Screen; query: string; setQuery: (v: string) => void;
  typeFilter: TypeFilter; setTypeFilter: (v: TypeFilter) => void;
  extensionFilter: string; setExtensionFilter: (v: string) => void;
  extensions: string[]; imageExtensions: string[];
  sortField: SortField; setSortField: (v: SortField) => void;
  fromDate: string; setFromDate: (v: string) => void;
  toDate: string; setToDate: (v: string) => void;
  minSizeMb: string; setMinSizeMb: (v: string) => void;
  maxSizeMb: string; setMaxSizeMb: (v: string) => void;
  clearFilters: () => void;
  filtersOpen: boolean; setFiltersOpen: (v: boolean) => void;
  activeFilterCount: number;
  onScreenChange: (screen: Screen) => void;
}) {
  return (
    <div className="mb-4 space-y-3">
      {/* Top row: search + controls */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-od-outline" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={screen === "images" ? "Buscar imágenes..." : "Buscar objetos..."}
            className="h-9 rounded-full border-od-outline-variant bg-od-surface-low pl-10 focus:border-od-primary focus:ring-2 focus:ring-od-primary/10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className={`border-od-outline-variant ${filtersOpen ? "bg-od-secondary-container text-od-primary" : ""}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filtros
            {activeFilterCount > 0 && (
              <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-od-primary text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="icon" className="border-od-outline-variant" onClick={clearFilters} />}>
                <X className="size-4" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>Limpiar filtros</TooltipContent>
            </Tooltip>
          )}

          <NativeSelect value={sortField} onChange={(value) => setSortField(value as SortField)} className="w-[150px]">
            <option value="lastModified">Recientes</option>
            <option value="score">Mejor match</option>
            <option value="size">Mayor tamaño</option>
            <option value="fileName">Nombre</option>
          </NativeSelect>

          <div className="flex rounded-lg border border-od-outline-variant bg-od-surface-low p-1">
            <Button type="button" size="sm" variant={screen === "files" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => onScreenChange("files")}>
              <List className="size-4" aria-hidden />
            </Button>
            <Button type="button" size="sm" variant={screen === "images" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => onScreenChange("images")}>
              <Grid3X3 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {/* Gallery format pills */}
      {screen === "images" && imageExtensions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExtensionFilter("")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!extensionFilter ? "bg-od-primary text-white" : "bg-od-surface-high text-od-text-muted hover:bg-od-surface-container"}`}
          >
            Todas
          </button>
          {imageExtensions.map((ext) => (
            <button
              key={ext}
              type="button"
              onClick={() => setExtensionFilter(extensionFilter === ext ? "" : ext)}
              className={`rounded-full px-3 py-1 text-xs font-medium uppercase transition-colors ${extensionFilter === ext ? "bg-od-primary text-white" : "bg-od-surface-high text-od-text-muted hover:bg-od-surface-container"}`}
            >
              {ext}
            </button>
          ))}
        </div>
      )}

      {/* Expanded filters drawer */}
      {filtersOpen && (
        <div className="rounded-xl border border-od-outline-variant bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-od-text">Filtros avanzados</p>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-od-primary" onClick={clearFilters}>
              Limpiar todos
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-od-outline">Tipo</Label>
              {screen !== "images" ? (
                <NativeSelect value={typeFilter} onChange={(value) => setTypeFilter(value as TypeFilter)}>
                  <option value="all">Todos</option>
                  <option value="image">Imágenes</option>
                  <option value="pdf">PDF</option>
                  <option value="other">Otros</option>
                </NativeSelect>
              ) : (
                <div className="flex h-9 items-center rounded-lg border border-od-outline-variant bg-od-secondary-container px-3 text-sm font-medium text-od-primary">Solo imágenes</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-od-outline">Extensión</Label>
              <NativeSelect value={extensionFilter} onChange={setExtensionFilter}>
                <option value="">Todas</option>
                {extensions.map((ext) => <option key={ext} value={ext}>.{ext}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-od-outline">Desde</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 border-od-outline-variant bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-od-outline">Hasta</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 border-od-outline-variant bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-od-outline">Tamaño mín. (MB)</Label>
              <Input inputMode="decimal" value={minSizeMb} onChange={(e) => setMinSizeMb(e.target.value)} placeholder="0" className="h-9 border-od-outline-variant bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-od-outline">Tamaño máx. (MB)</Label>
              <Input inputMode="decimal" value={maxSizeMb} onChange={(e) => setMaxSizeMb(e.target.value)} placeholder="Sin límite" className="h-9 border-od-outline-variant bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StatsStrip ───────────────────────────────────────────────────────────────

function StatsStrip({ total, visible, images, pdf, totalSize }: { total: number; visible: number; images: number; pdf: number; totalSize: string; }) {
  const items: [string, string][] = [["Visibles", visible.toString()], ["Total", total.toString()], ["Imágenes", images.toString()], ["PDF", pdf.toString()], ["Tamaño", totalSize]];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center gap-1.5 rounded-full border border-od-outline-variant bg-white px-3 py-1.5 shadow-sm">
          <span className="text-xs text-od-outline">{label}:</span>
          <span className="text-xs font-semibold text-od-text">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── BatchActionBar ───────────────────────────────────────────────────────────

function BatchActionBar({ count, loading, onDelete, onDownload, onClear }: { count: number; loading: boolean; onDelete: () => void; onDownload: () => void; onClear: () => void; }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-od-primary/20 bg-od-secondary-container px-4 py-2.5">
      <span className="text-sm font-medium text-od-primary">{count} archivo(s) seleccionado(s)</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="border-od-outline-variant text-od-text-muted" onClick={onDownload} disabled={loading}>
          <Download className="size-3.5" aria-hidden />
          Descargar
        </Button>
        <Button variant="outline" size="sm" className="border-od-error/30 text-od-error hover:bg-od-error/5" onClick={onDelete} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
          Eliminar
        </Button>
        <Button variant="ghost" size="icon" className="size-7 text-od-text-muted" onClick={onClear}>
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ─── PaginationControls ───────────────────────────────────────────────────────

function PaginationControls({ currentPage, totalPages, pageSize, totalItems, onPageChange, onPageSizeChange }: { currentPage: number; totalPages: number; pageSize: number; totalItems: number; onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void; }) {
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border border-od-outline-variant bg-white px-4 py-3 shadow-sm">
      <span className="text-sm text-od-text-muted">
        Mostrando{" "}<span className="font-medium text-od-text">{firstItem}–{lastItem}</span>{" "}de{" "}<span className="font-medium text-od-text">{totalItems}</span>
      </span>
      <div className="flex items-center gap-2">
        <NativeSelect value={String(pageSize)} onChange={(value) => onPageSizeChange(Number(value))} className="w-[132px]">
          <option value="25">25 por página</option>
          <option value="50">50 por página</option>
          <option value="100">100 por página</option>
          <option value="200">200 por página</option>
        </NativeSelect>
        <Button type="button" variant="ghost" size="icon" className="size-8 text-od-text-muted" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-16 text-center text-sm font-semibold text-od-primary">{currentPage} / {totalPages}</span>
        <Button type="button" variant="ghost" size="icon" className="size-8 text-od-text-muted" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ─── FilesTable ───────────────────────────────────────────────────────────────

function FilesTable({ loading, files, selectedFile, selectedKeys, onOpen, onReplace, onDelete, onToggleKey, onToggleAll, actionLoadingKey }: {
  loading: boolean; files: Array<{ file: ListedS3File; score: number }>;
  selectedFile: ListedS3File | null; selectedKeys: Set<string>;
  onOpen: (file: ListedS3File) => void; onReplace: (file: ListedS3File) => void; onDelete: (file: ListedS3File) => void;
  onToggleKey: (key: string, add: boolean) => void; onToggleAll: (add: boolean) => void;
  actionLoadingKey: string | null;
}) {
  const allChecked = files.length > 0 && files.every(({ file }) => selectedKeys.has(file.key));
  const someChecked = files.some(({ file }) => selectedKeys.has(file.key)) && !allChecked;

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-od-outline-variant bg-white shadow-sm">
      <div className="h-full overflow-auto custom-scrollbar">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-od-surface-low">
            <TableRow className="border-od-outline-variant">
              <TableHead className="w-12">
                <Checkbox
                  checked={allChecked}
                  data-state={someChecked ? "indeterminate" : allChecked ? "checked" : "unchecked"}
                  onCheckedChange={(checked) => onToggleAll(Boolean(checked))}
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-od-outline">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-od-outline">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-od-outline">Size</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-od-outline">Last Modified</TableHead>
              <TableHead className="w-36 text-right text-xs uppercase tracking-wider text-od-outline">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !files.length && Array.from({ length: 9 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
            ))}
            {files.map(({ file }) => (
              <TableRow
                key={file.key}
                onClick={() => onOpen(file)}
                className={`group cursor-pointer border-od-outline-variant transition-colors hover:bg-od-surface-low/70 ${selectedFile?.key === file.key ? "bg-od-secondary-container/35" : ""} ${selectedKeys.has(file.key) ? "bg-od-secondary-container/20" : ""}`}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selectedKeys.has(file.key)} onCheckedChange={(checked) => onToggleKey(file.key, Boolean(checked))} />
                </TableCell>
                <TableCell className="min-w-[340px] max-w-[560px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-od-surface-low text-od-primary">{typeIcon(file.type)}</div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-od-text">{file.fileName}</p>
                      <p className="truncate font-mono text-xs text-od-text-muted">{file.key}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${file.type === "image" ? "bg-od-secondary-container text-od-primary hover:bg-od-secondary-container" : file.type === "pdf" ? "bg-od-surface-high text-od-text-muted hover:bg-od-surface-high" : "bg-od-surface-low text-od-text-muted hover:bg-od-surface-low"}`}>
                    {typeLabel(file.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-od-text-muted">{formatBytes(file.size)}</TableCell>
                <TableCell className="text-od-text-muted">{formatDate(file.lastModified)}</TableCell>
                <TableCell>
                  <div className={`transition-opacity ${selectedFile?.key === file.key ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    <RowActions file={file} loading={actionLoadingKey === file.key} onOpen={onOpen} onReplace={onReplace} onDelete={onDelete} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && !files.length && (
              <TableRow><TableCell colSpan={6}><EmptyState /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── GalleryCard (with lazy thumbnail) ───────────────────────────────────────

function GalleryCard({ file, connection, isSelected, onOpen, onReplace, onDelete, loading }: {
  file: ListedS3File; connection: S3Connection; isSelected: boolean;
  onOpen: (f: ListedS3File) => void; onReplace: (f: ListedS3File) => void; onDelete: (f: ListedS3File) => void;
  loading: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => thumbCache.get(file.key) ?? null);
  const [thumbLoading, setThumbLoading] = useState(false);

  useEffect(() => {
    if (file.type !== "image") return;
    if (thumbCache.has(file.key)) { setThumbUrl(thumbCache.get(file.key)!); return; }

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();

      setThumbLoading(true);
      fetch("/api/s3/object", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection, key: file.key }) })
        .then((res) => res.ok ? res.blob() : Promise.reject())
        .then((blob) => {
          // Evict oldest entries if cache is too large
          if (thumbCache.size >= 200) {
            const first = thumbCache.keys().next().value;
            if (first) { URL.revokeObjectURL(thumbCache.get(first)!); thumbCache.delete(first); }
          }
          const url = URL.createObjectURL(blob);
          thumbCache.set(file.key, url);
          setThumbUrl(url);
        })
        .catch(() => { /* silent */ })
        .finally(() => setThumbLoading(false));
    }, { rootMargin: "200px", threshold: 0 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [file.key, file.type, connection]);

  return (
    <div ref={cardRef} className={`group overflow-hidden rounded-xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${isSelected ? "border-od-primary ring-2 ring-od-primary/10" : "border-od-outline-variant"}`}>
      <button type="button" onClick={() => onOpen(file)} className="relative grid aspect-square w-full place-items-center overflow-hidden bg-od-surface-container">
        {thumbLoading && <Skeleton className="absolute inset-0 rounded-none" />}
        {thumbUrl && !thumbLoading ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="h-full w-full object-cover" src={thumbUrl} alt={file.fileName} />
        ) : !thumbLoading ? (
          <FileImage className="size-12 text-od-outline" aria-hidden />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-od-text/20 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="grid size-9 place-items-center rounded-full bg-white/90 text-od-text"><Eye className="size-4" aria-hidden /></span>
          <span className="grid size-9 place-items-center rounded-full bg-white/90 text-od-text"><Download className="size-4" aria-hidden /></span>
        </div>
        <span className="absolute right-3 top-3 rounded border border-od-outline-variant bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase text-od-primary">
          {file.extension || "img"}
        </span>
      </button>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-od-text">{file.fileName}</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-od-text-muted">
          <span>{formatBytes(file.size)}</span>
          <span className="truncate">{formatDate(file.lastModified)}</span>
        </div>
        <div className="mt-3">
          <RowActions file={file} loading={loading} onOpen={onOpen} onReplace={onReplace} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

// ─── ImagesGallery ────────────────────────────────────────────────────────────

function ImagesGallery({ loading, files, selectedFile, connection, onOpen, onReplace, onDelete, actionLoadingKey }: {
  loading: boolean; files: Array<{ file: ListedS3File; score: number }>; selectedFile: ListedS3File | null;
  connection: S3Connection; onOpen: (f: ListedS3File) => void; onReplace: (f: ListedS3File) => void; onDelete: (f: ListedS3File) => void;
  actionLoadingKey: string | null;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto custom-scrollbar rounded-xl border border-od-outline-variant bg-white p-5">
      {loading && !files.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : files.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {files.map(({ file }) => (
            <GalleryCard
              key={file.key}
              file={file}
              connection={connection}
              isSelected={selectedFile?.key === file.key}
              onOpen={onOpen}
              onReplace={onReplace}
              onDelete={onDelete}
              loading={actionLoadingKey === file.key}
            />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

// ─── RowActions ───────────────────────────────────────────────────────────────

function RowActions({ file, loading, onOpen, onReplace, onDelete }: { file: ListedS3File; loading: boolean; onOpen: (f: ListedS3File) => void; onReplace: (f: ListedS3File) => void; onDelete: (f: ListedS3File) => void; }) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-od-primary" onClick={() => onOpen(file)} disabled={loading} />}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </TooltipTrigger>
        <TooltipContent>Ver detalles</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-od-secondary" onClick={() => onReplace(file)} disabled={loading} />}>
          <Upload className="size-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Reemplazar archivo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-od-error" onClick={() => onDelete(file)} disabled={loading} />}>
          <Trash2 className="size-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Eliminar archivo</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="grid justify-items-center gap-2 py-16 text-center text-od-text-muted">
      <GalleryHorizontalEnd className="size-9" aria-hidden />
      <p>No hay archivos que coincidan con los filtros actuales.</p>
    </div>
  );
}

// ─── ExplorerScreen ───────────────────────────────────────────────────────────

type S3FolderEntry = { prefix: string; name: string };

function ExplorerScreen({
  connection,
  addToast
}: {
  connection: S3Connection;
  addToast: (type: Toast["type"], text: string) => void;
}) {
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [folders, setFolders] = useState<S3FolderEntry[]>([]);
  const [files, setFiles] = useState<ListedS3File[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ListedS3File | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<ListedS3File | null>(null);

  const connected = isConnectionValid(connection);

  useEffect(() => {
    if (connected) browse(currentPrefix, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrefix]);

  useEffect(() => {
    if (connected) browse("", true);
    setCurrentPrefix("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.bucket, connection.endpoint]);

  async function browse(prefix: string, reset = true, token?: string | null) {
    setLoading(true);
    if (reset) { setFolders([]); setFiles([]); setNextToken(null); }
    try {
      const response = await fetch("/api/s3/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection, prefix, continuationToken: token ?? null })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo explorar el directorio");
      if (reset) {
        setFolders(payload.folders ?? []);
        setFiles(payload.files ?? []);
      } else {
        setFolders((prev) => [...prev, ...(payload.folders ?? [])]);
        setFiles((prev) => [...prev, ...(payload.files ?? [])]);
      }
      setNextToken(payload.nextContinuationToken ?? null);
      setIsTruncated(payload.isTruncated ?? false);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Error explorando directorio");
    } finally {
      setLoading(false);
    }
  }

  function navigateInto(folderPrefix: string) {
    setSelectedFile(null);
    setDetailOpen(false);
    setCurrentPrefix(folderPrefix);
  }

  function navigateUp() {
    const trimmed = currentPrefix.replace(/\/$/, "");
    const idx = trimmed.lastIndexOf("/");
    const parent = idx >= 0 ? `${trimmed.slice(0, idx)}/` : "";
    setCurrentPrefix(parent);
    setSelectedFile(null);
    setDetailOpen(false);
  }

  function navigateTo(prefix: string) {
    setCurrentPrefix(prefix);
    setSelectedFile(null);
    setDetailOpen(false);
  }

  // Breadcrumb segments from current prefix
  const breadcrumbs = currentPrefix.replace(/\/$/, "").split("/").filter(Boolean);

  // ── File operations (local to Explorer) ──────────────────────────────────
  async function deleteFile(file: ListedS3File) {
    const confirmed = window.confirm(`¿Eliminar ${file.fileName} de S3? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setActionLoadingKey(file.key);
    try {
      const response = await fetch("/api/s3/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection, key: file.key })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo eliminar el archivo");
      setFiles((prev) => prev.filter((f) => f.key !== file.key));
      if (selectedFile?.key === file.key) { setSelectedFile(null); setDetailOpen(false); }
      thumbCache.delete(file.key);
      addToast("ok", `Archivo eliminado: ${file.fileName}`);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Error eliminando archivo");
    } finally {
      setActionLoadingKey(null);
    }
  }

  function requestReplace(file: ListedS3File) {
    replaceTargetRef.current = file;
    replaceInputRef.current?.click();
  }

  async function replaceFile(event: ChangeEvent<HTMLInputElement>) {
    const replacement = event.target.files?.[0];
    const target = replaceTargetRef.current;
    event.target.value = "";
    if (!replacement || !target) return;
    setActionLoadingKey(target.key);
    try {
      const formData = new FormData();
      formData.append("connection", JSON.stringify(connection));
      formData.append("key", target.key);
      formData.append("file", replacement);
      const response = await fetch("/api/s3/replace", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo reemplazar el archivo");
      thumbCache.delete(target.key);
      addToast("ok", `Archivo reemplazado: ${target.fileName}`);
      browse(currentPrefix, true);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Error reemplazando archivo");
    } finally {
      setActionLoadingKey(null);
      replaceTargetRef.current = null;
    }
  }

  const isEmpty = !loading && folders.length === 0 && files.length === 0;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Breadcrumb bar */}
        <div className="shrink-0 border-b border-od-outline-variant bg-white px-6 py-3">
          <div className="flex items-center gap-2">
            {currentPrefix && (
              <button
                type="button"
                onClick={navigateUp}
                className="flex items-center gap-1.5 rounded-lg border border-od-outline-variant px-2.5 py-1.5 text-xs font-medium text-od-text-muted transition-colors hover:border-od-primary hover:text-od-primary"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Atrás
              </button>
            )}

            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => navigateTo("")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${!currentPrefix ? "font-semibold text-od-primary" : "text-od-text-muted hover:text-od-primary"}`}
              >
                <Home className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{connection.bucket || "Bucket"}</span>
              </button>

              {breadcrumbs.map((segment, index) => {
                const prefix = `${breadcrumbs.slice(0, index + 1).join("/")}/`;
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <span key={prefix} className="flex items-center gap-1 min-w-0">
                    <ChevronRight className="size-3.5 shrink-0 text-od-outline" aria-hidden />
                    <button
                      type="button"
                      onClick={() => navigateTo(prefix)}
                      className={`max-w-[140px] truncate rounded-md px-2 py-1 transition-colors ${isLast ? "font-semibold text-od-primary" : "text-od-text-muted hover:text-od-primary"}`}
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => browse(currentPrefix, true)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-od-text-muted transition-colors hover:text-od-primary disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="size-3.5" aria-hidden />}
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>

          {!loading && (
            <p className="mt-1 text-xs text-od-text-muted">
              {folders.length} carpeta{folders.length !== 1 ? "s" : ""} · {files.length} archivo{files.length !== 1 ? "s" : ""}
              {isTruncated && " · más disponibles"}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar p-6">
          {!connected && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-full bg-od-surface-low">
                <FolderTree className="size-6 text-od-outline" aria-hidden />
              </div>
              <p className="text-base font-semibold text-od-text">Sin conexión</p>
              <p className="mt-1 max-w-xs text-sm text-od-text-muted">
                Ve a <strong>Settings</strong> y configura la conexión S3 para explorar el bucket.
              </p>
            </div>
          )}

          {connected && loading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          )}

          {connected && !loading && isEmpty && (
            <div className="flex flex-col items-center justify-center py-24 text-center text-od-text-muted">
              <Folder className="mb-3 size-10" aria-hidden />
              <p className="font-medium text-od-text">Carpeta vacía</p>
              <p className="mt-1 text-sm">No hay archivos ni subcarpetas en este directorio.</p>
            </div>
          )}

          {connected && !loading && (folders.length > 0 || files.length > 0) && (
            <div className="rounded-xl border border-od-outline-variant bg-white shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-od-surface-low">
                  <TableRow className="border-od-outline-variant">
                    <TableHead className="text-xs uppercase tracking-wider text-od-outline">Nombre</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-od-outline">Tipo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-od-outline">Tamaño</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-od-outline">Modificado</TableHead>
                    <TableHead className="w-32 text-right text-xs uppercase tracking-wider text-od-outline">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Folders first */}
                  {folders.map((folder) => (
                    <TableRow
                      key={folder.prefix}
                      onClick={() => navigateInto(folder.prefix)}
                      className="group cursor-pointer border-od-outline-variant transition-colors hover:bg-amber-50/60"
                    >
                      <TableCell className="min-w-[300px]">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100">
                            <Folder className="size-4 text-amber-600" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-od-text">{folder.name}</p>
                            <p className="truncate font-mono text-xs text-od-text-muted">{folder.prefix}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                          Carpeta
                        </Badge>
                      </TableCell>
                      <TableCell className="text-od-text-muted">—</TableCell>
                      <TableCell className="text-od-text-muted">—</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigateInto(folder.prefix); }}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-od-primary transition-colors hover:bg-od-secondary-container"
                          >
                            Abrir
                            <ChevronRight className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Files */}
                  {files.map((file) => (
                    <TableRow
                      key={file.key}
                      onClick={() => { setSelectedFile(file); setDetailOpen(true); }}
                      className={`group cursor-pointer border-od-outline-variant transition-colors hover:bg-od-surface-low/70 ${selectedFile?.key === file.key ? "bg-od-secondary-container/35" : ""}`}
                    >
                      <TableCell className="min-w-[300px]">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-od-surface-low text-od-primary">
                            {typeIcon(file.type)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-od-text">{file.fileName}</p>
                            <p className="truncate font-mono text-xs text-od-text-muted">{file.key}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${file.type === "image" ? "bg-od-secondary-container text-od-primary hover:bg-od-secondary-container" : file.type === "pdf" ? "bg-od-surface-high text-od-text-muted hover:bg-od-surface-high" : "bg-od-surface-low text-od-text-muted hover:bg-od-surface-low"}`}>
                          {typeLabel(file.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-od-text-muted">{formatBytes(file.size)}</TableCell>
                      <TableCell className="text-od-text-muted">{formatDate(file.lastModified)}</TableCell>
                      <TableCell>
                        <div className={`transition-opacity ${selectedFile?.key === file.key ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                          <RowActions
                            file={file}
                            loading={actionLoadingKey === file.key}
                            onOpen={(f) => { setSelectedFile(f); setDetailOpen(true); }}
                            onReplace={requestReplace}
                            onDelete={deleteFile}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {isTruncated && (
                <div className="border-t border-od-outline-variant bg-od-surface-low px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-od-outline-variant"
                    onClick={() => browse(currentPrefix, false, nextToken)}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCcw aria-hidden />}
                    Cargar más archivos
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* File detail panel */}
      <FileDetailPanel
        file={selectedFile}
        open={detailOpen}
        connection={connection as import("@/lib/s3").S3Connection}
        onClose={() => { setDetailOpen(false); setSelectedFile(null); }}
        onReplace={requestReplace}
        onDelete={deleteFile}
        onToast={addToast}
      />

      <input ref={replaceInputRef} type="file" className="hidden" onChange={replaceFile} />
    </div>
  );
}

// ─── DashboardScreen ──────────────────────────────────────────────────────────

function DashboardScreen({ files, loading, connection }: { files: ListedS3File[]; loading: boolean; connection: S3Connection; }) {
  const total = files.length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const images = files.filter((f) => f.type === "image");
  const pdfs = files.filter((f) => f.type === "pdf");
  const others = files.filter((f) => f.type === "other");
  const imageSize = images.reduce((s, f) => s + f.size, 0);
  const pdfSize = pdfs.reduce((s, f) => s + f.size, 0);
  const otherSize = others.reduce((s, f) => s + f.size, 0);

  const extMap = new Map<string, number>();
  for (const f of files) { if (f.extension) extMap.set(f.extension, (extMap.get(f.extension) ?? 0) + 1); }
  const topExtensions = Array.from(extMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const recentFiles = [...files].slice(0, 14);
  const now = Date.now();
  const last30 = files.filter((f) => f.lastModified && now - new Date(f.lastModified).getTime() < 30 * 24 * 60 * 60 * 1000).length;

  const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const sizeOf = (s: number) => (totalSize > 0 ? Math.round((s / totalSize) * 100) : 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-10 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-od-text">Dashboard</h2>
          <p className="mt-1 text-sm text-od-text-muted">
            {connection.bucket ? `Bucket: ${connection.bucket}${connection.prefix ? ` / ${connection.prefix}` : ""}` : "Conecta un bucket en Settings para ver las métricas."}
          </p>
        </div>

        {loading && !total && (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-xl" />)}
          </div>
        )}

        {!loading && !total && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-od-outline-variant bg-white py-24 text-center shadow-sm">
            <div className="mb-4 grid size-14 place-items-center rounded-full bg-od-surface-low">
              <Activity className="size-6 text-od-outline" aria-hidden />
            </div>
            <p className="text-base font-semibold text-od-text">Sin datos todavía</p>
            <p className="mt-1 max-w-xs text-sm text-od-text-muted">Ve a <strong>Settings</strong>, configura la conexión S3 y refresca para ver el dashboard.</p>
          </div>
        )}

        {total > 0 && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                { label: "Total archivos", icon: <Database className="size-4 text-od-primary" aria-hidden />, bg: "bg-od-surface-low", value: total.toLocaleString("es-CO"), sub: `${last30 > 0 ? `+${last30}` : "Sin actividad"} en 30 días` },
                { label: "Almacenamiento", icon: <HardDrive className="size-4 text-od-primary" aria-hidden />, bg: "bg-od-surface-low", value: formatBytes(totalSize), sub: `Promedio ${formatBytes(total > 0 ? Math.round(totalSize / total) : 0)} / archivo` },
                { label: "Imágenes", icon: <ImageIcon className="size-4 text-od-primary" aria-hidden />, bg: "bg-od-secondary-container", value: images.length.toLocaleString("es-CO"), sub: `${pctOf(images.length)}% del total · ${formatBytes(imageSize)}` },
                { label: "Documentos PDF", icon: <FileText className="size-4 text-od-text-muted" aria-hidden />, bg: "bg-od-surface-high", value: pdfs.length.toLocaleString("es-CO"), sub: `${pctOf(pdfs.length)}% del total · ${formatBytes(pdfSize)}` },
              ].map(({ label, icon, bg, value, sub }) => (
                <Card key={label} className="border border-od-outline-variant bg-white shadow-sm ring-0">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardDescription className="text-xs font-medium uppercase tracking-wider text-od-outline">{label}</CardDescription>
                      <div className={`grid size-8 place-items-center rounded-lg ${bg}`}>{icon}</div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-od-text">{value}</p>
                    <p className="mt-1 text-xs text-od-text-muted">{sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <div className="flex flex-col gap-6">
                <Card className="border border-od-outline-variant bg-white shadow-sm ring-0">
                  <CardHeader className="border-b border-od-outline-variant">
                    <CardTitle className="text-base font-semibold text-od-text">Distribución de archivos</CardTitle>
                    <CardDescription>Desglose por tipo de contenido</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-5">
                    <Tabs defaultValue="count">
                      <TabsList className="mb-5 bg-od-surface-low">
                        <TabsTrigger value="count" className="text-xs">Por cantidad</TabsTrigger>
                        <TabsTrigger value="size" className="text-xs">Por tamaño</TabsTrigger>
                      </TabsList>
                      <TabsContent value="count">
                        <div className="space-y-5">
                          <TypeBar label="Imágenes" pct={pctOf(images.length)} color="bg-od-primary" subtext={`${images.length.toLocaleString("es-CO")} archivos · ${formatBytes(imageSize)}`} />
                          <TypeBar label="Documentos PDF" pct={pctOf(pdfs.length)} color="bg-od-text-muted" subtext={`${pdfs.length.toLocaleString("es-CO")} archivos · ${formatBytes(pdfSize)}`} />
                          <TypeBar label="Otros" pct={pctOf(others.length)} color="bg-od-outline-variant" subtext={`${others.length.toLocaleString("es-CO")} archivos · ${formatBytes(otherSize)}`} />
                        </div>
                      </TabsContent>
                      <TabsContent value="size">
                        <div className="space-y-5">
                          <TypeBar label="Imágenes" pct={sizeOf(imageSize)} color="bg-od-primary" subtext={`${formatBytes(imageSize)} · ${sizeOf(imageSize)}% del almacenamiento`} />
                          <TypeBar label="Documentos PDF" pct={sizeOf(pdfSize)} color="bg-od-text-muted" subtext={`${formatBytes(pdfSize)} · ${sizeOf(pdfSize)}% del almacenamiento`} />
                          <TypeBar label="Otros" pct={sizeOf(otherSize)} color="bg-od-outline-variant" subtext={`${formatBytes(otherSize)} · ${sizeOf(otherSize)}% del almacenamiento`} />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <Card className="border border-od-outline-variant bg-white shadow-sm ring-0">
                  <CardHeader className="border-b border-od-outline-variant">
                    <CardTitle className="text-base font-semibold text-od-text">Extensiones</CardTitle>
                    <CardDescription>Tipos de archivo más frecuentes en el bucket</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-5">
                    {topExtensions.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                        {topExtensions.map(([ext, count]) => (
                          <div key={ext} className="flex items-center justify-between gap-2 rounded-lg border border-od-outline-variant bg-od-surface-low px-3 py-2.5">
                            <Badge className="rounded-full bg-od-secondary-container px-2 py-0 text-[10px] font-bold uppercase text-od-primary hover:bg-od-secondary-container">.{ext}</Badge>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-od-text">{count}</p>
                              <p className="text-[10px] text-od-outline">{pctOf(count)}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="py-4 text-center text-sm text-od-text-muted">Sin datos de extensiones</p>}
                  </CardContent>
                </Card>
              </div>

              <Card className="flex flex-col border border-od-outline-variant bg-white shadow-sm ring-0">
                <CardHeader className="border-b border-od-outline-variant">
                  <CardTitle className="text-base font-semibold text-od-text">Archivos recientes</CardTitle>
                  <CardDescription>Últimos {recentFiles.length} archivos modificados</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <ScrollArea className="h-[480px]">
                    <div className="divide-y divide-od-outline-variant">
                      {recentFiles.map((file) => (
                        <div key={file.key} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-od-surface-low">
                          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-od-surface-low text-od-primary">{typeIcon(file.type)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-od-text">{file.fileName}</p>
                            <p className="text-xs text-od-text-muted">{formatBytes(file.size)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs text-od-outline">{file.lastModified ? new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(file.lastModified)) : "—"}</p>
                            <Badge className={`mt-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold ${file.type === "image" ? "bg-od-secondary-container text-od-primary hover:bg-od-secondary-container" : "bg-od-surface-high text-od-text-muted hover:bg-od-surface-high"}`}>
                              {file.extension || file.type}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6 bg-od-outline-variant/50" />

            <div className="flex flex-wrap items-center gap-4 text-xs text-od-text-muted">
              <span className="flex items-center gap-1.5"><Database className="size-3.5" aria-hidden />{total.toLocaleString("es-CO")} objetos totales</span>
              <span className="flex items-center gap-1.5"><HardDrive className="size-3.5" aria-hidden />{formatBytes(totalSize)} usados</span>
              <span className="flex items-center gap-1.5"><Activity className="size-3.5" aria-hidden />{extMap.size} tipos de extensión</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TypeBar({ label, pct, color, subtext }: { label: string; pct: number; color: string; subtext: string; }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-od-text">{label}</span>
        <span className="font-semibold text-od-primary">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-od-surface-high">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="text-xs text-od-text-muted">{subtext}</p>
    </div>
  );
}

// ─── Provider presets ─────────────────────────────────────────────────────────

type ProviderPreset = {
  id: string;
  name: string;
  badge: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  note: string;
};

const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "aws",          name: "Amazon S3",          badge: "AWS",  endpoint: "https://s3.{region}.amazonaws.com",              region: "us-east-1",   forcePathStyle: false, note: "Reemplaza {region} con tu región AWS (ej. us-east-1)" },
  { id: "cloudflare",   name: "Cloudflare R2",       badge: "R2",   endpoint: "https://{account_id}.r2.cloudflarestorage.com",  region: "auto",        forcePathStyle: true,  note: "Reemplaza {account_id} con tu ID de cuenta Cloudflare" },
  { id: "backblaze",    name: "Backblaze B2",         badge: "B2",   endpoint: "https://s3.{region}.backblazeb2.com",            region: "us-west-004", forcePathStyle: true,  note: "Reemplaza {region} con tu región Backblaze (ej. us-west-004)" },
  { id: "digitalocean", name: "DigitalOcean Spaces",  badge: "DO",   endpoint: "https://{region}.digitaloceanspaces.com",        region: "nyc3",        forcePathStyle: false, note: "Reemplaza {region} con tu datacenter (ej. nyc3, ams3, sgp1)" },
  { id: "wasabi",       name: "Wasabi",               badge: "WS",   endpoint: "https://s3.{region}.wasabisys.com",              region: "us-east-1",   forcePathStyle: false, note: "Reemplaza {region} con tu región Wasabi (ej. us-east-1)" },
  { id: "minio",        name: "MinIO",                badge: "MIN",  endpoint: "https://minio.tu-dominio.com",                   region: "us-east-1",   forcePathStyle: true,  note: "Ingresa la URL de tu instancia MinIO" },
  { id: "supabase",     name: "Supabase Storage",     badge: "SUP",  endpoint: "https://{project-ref}.supabase.co/storage/v1/s3", region: "us-east-1",  forcePathStyle: true,  note: "Reemplaza {project-ref} con el ID de tu proyecto Supabase" },
  { id: "railway",      name: "Railway",              badge: "RLY",  endpoint: "https://tu-endpoint.railway.app",                region: "us-east-1",   forcePathStyle: true,  note: "Ingresa el endpoint S3 de tu servicio Railway" },
  { id: "vultr",        name: "Vultr Storage",        badge: "VLT",  endpoint: "https://{region}.vultrobjects.com",              region: "ewr1",        forcePathStyle: false, note: "Reemplaza {region} con tu región Vultr (ej. ewr1, sjc1)" },
  { id: "linode",       name: "Linode / Akamai",      badge: "LIN",  endpoint: "https://{region}.linodeobjects.com",             region: "us-east-1",   forcePathStyle: false, note: "Reemplaza {region} con tu datacenter Linode (ej. us-east-1)" },
];

// ─── SettingsScreen ───────────────────────────────────────────────────────────

function SettingsScreen({ connection, connectionStatus, savedConnections, activeConnectionId, loading, onSubmit, onChange, onTest, onDisconnect, onSaveAsNew, onActivate, onRename, onDeleteSaved }: {
  connection: S3Connection; connectionStatus: ConnectionStatus;
  savedConnections: SavedConnection[]; activeConnectionId: string | null;
  loading: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onChange: <K extends keyof S3Connection>(key: K, value: S3Connection[K]) => void;
  onTest: () => void; onDisconnect: () => void;
  onSaveAsNew: () => void; onActivate: (id: string) => void;
  onRename: (id: string) => void; onDeleteSaved: (id: string) => void;
}) {
  const [settingsTab, setSettingsTab] = useState<"connection" | "security">("connection");
  const [testLoading, setTestLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  async function handleTest() {
    setTestLoading(true);
    await onTest();
    setTestLoading(false);
  }

  function applyPreset(preset: ProviderPreset) {
    setSelectedProvider(preset.id);
    onChange("endpoint", preset.endpoint);
    onChange("region", preset.region);
    onChange("forcePathStyle", preset.forcePathStyle);
  }

  const statusBadge = {
    connected: <Badge className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-100">Conectado</Badge>,
    error: <Badge className="rounded-full bg-od-error-container px-3 py-1 text-xs font-semibold text-od-error hover:bg-od-error-container">Error</Badge>,
    untested: <Badge className="rounded-full bg-od-secondary-container px-3 py-1 text-xs font-semibold text-od-primary hover:bg-od-secondary-container">Sin probar</Badge>,
  }[connectionStatus];

  const activePreset = PROVIDER_PRESETS.find((p) => p.id === selectedProvider);
  const activeConn = savedConnections.find((c) => c.id === activeConnectionId);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-10 py-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-10">
          <h2 className="text-3xl font-semibold text-od-text">Settings</h2>
          <p className="mt-2 text-sm text-od-text-muted">
            Compatible con <span className="font-medium text-od-text">Amazon S3, Cloudflare R2, MinIO, Backblaze B2, DigitalOcean Spaces</span> y cualquier storage S3-compatible.
          </p>
        </div>

        <div className="flex gap-12">
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="space-y-1">
              <SettingsNav icon={Server} label="Connection" active={settingsTab === "connection"} onClick={() => setSettingsTab("connection")} />
              <SettingsNav icon={ShieldCheck} label="Security" active={settingsTab === "security"} onClick={() => setSettingsTab("security")} />
            </div>
            <div className="mt-8 rounded-xl border border-od-outline-variant bg-od-surface-low p-5">
              <h3 className="mb-3 text-sm font-medium text-od-text">Modo local</h3>
              <p className="text-sm leading-6 text-od-text-muted">Las credenciales solo viven en tu navegador (localStorage ofuscado). Ningún dato sale del servidor Next.js.</p>
            </div>
          </aside>

          <div className="max-w-3xl flex-1 space-y-6">
            {/* ── Saved connections manager ─────────────────────────────── */}
            <div className="rounded-xl border border-od-outline-variant bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-od-text">Conexiones guardadas</h3>
                  <p className="text-xs text-od-text-muted">Cambia entre clientes y entornos con un click</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 border-od-outline-variant text-xs" onClick={onSaveAsNew}>
                  <Plus className="size-3.5" aria-hidden />
                  Guardar actual
                </Button>
              </div>

              {savedConnections.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-od-outline-variant py-8 text-center">
                  <Database className="size-7 text-od-outline" aria-hidden />
                  <p className="text-sm text-od-text-muted">No hay conexiones guardadas</p>
                  <p className="text-xs text-od-outline">Configura la conexión y haz click en "Guardar actual"</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedConnections.map((saved) => {
                    const isActive = saved.id === activeConnectionId;
                    return (
                      <div
                        key={saved.id}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${isActive ? "border-od-primary/30 bg-od-secondary-container/40" : "border-od-outline-variant bg-od-surface-low hover:border-od-primary/20"}`}
                      >
                        <span className={`size-2.5 shrink-0 rounded-full ${isActive ? "bg-green-500" : "bg-od-outline"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-od-text">{saved.name}</p>
                            {isActive && <Badge className="rounded-full bg-green-100 px-2 py-0 text-[10px] font-bold text-green-700 hover:bg-green-100">Activa</Badge>}
                          </div>
                          <p className="truncate font-mono text-xs text-od-text-muted">
                            {saved.connection.bucket || "—"} · {saved.connection.endpoint ? new URL(saved.connection.endpoint.replace("{region}", saved.connection.region)).hostname : "—"}
                          </p>
                          {saved.lastUsed && <p className="text-[10px] text-od-outline">Última vez: {new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(saved.lastUsed))}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          {!isActive && (
                            <Tooltip>
                              <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-od-primary hover:bg-od-secondary-container" onClick={() => onActivate(saved.id)} />}>
                                <Zap className="size-3.5" aria-hidden />
                              </TooltipTrigger>
                              <TooltipContent>Activar y conectar</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-od-text-muted hover:text-od-primary" onClick={() => onRename(saved.id)} />}>
                              <Pencil className="size-3.5" aria-hidden />
                            </TooltipTrigger>
                            <TooltipContent>Renombrar</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-od-error hover:bg-od-error/5" onClick={() => onDeleteSaved(saved.id)} />}>
                              <Trash2 className="size-3.5" aria-hidden />
                            </TooltipTrigger>
                            <TooltipContent>Eliminar conexión</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {settingsTab === "connection" ? (
              <>
                {/* Provider presets */}
                <div className="rounded-xl border border-od-outline-variant bg-white p-5">
                  <h3 className="mb-1 text-sm font-semibold text-od-text">Proveedor de almacenamiento</h3>
                  <p className="mb-4 text-xs text-od-text-muted">Selecciona tu proveedor para autocompletar el endpoint. Luego ajusta los valores si es necesario.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {PROVIDER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-center transition-all hover:shadow-sm ${
                          selectedProvider === preset.id
                            ? "border-od-primary bg-od-secondary-container shadow-sm"
                            : "border-od-outline-variant bg-od-surface-low hover:border-od-primary/40"
                        }`}
                      >
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                          selectedProvider === preset.id ? "bg-od-primary text-white" : "bg-od-surface-high text-od-text-muted"
                        }`}>
                          {preset.badge}
                        </span>
                        <span className="text-xs font-medium leading-tight text-od-text">{preset.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* Note for selected provider */}
                  {activePreset && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-od-primary/20 bg-od-secondary-container/40 px-3 py-2">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-od-primary" aria-hidden />
                      <p className="text-xs text-od-text-muted">
                        <span className="font-medium text-od-primary">{activePreset.name}:</span>{" "}
                        {activePreset.note}
                      </p>
                    </div>
                  )}
                </div>

                {/* Connection form */}
                <form onSubmit={onSubmit} className="rounded-xl border border-od-outline-variant bg-white p-6">
                  <div className="mb-6 flex items-center justify-between border-b border-od-outline-variant pb-5">
                    <div>
                      <h3 className="text-lg font-semibold text-od-text">
                        {activeConn ? activeConn.name : "Nueva conexión"}
                      </h3>
                      <p className="text-sm text-od-text-muted">
                        {activePreset ? `Configurado para ${activePreset.name}` : activeConn ? `${activeConn.connection.endpoint}` : "Cualquier storage compatible con S3."}
                      </p>
                    </div>
                    {statusBadge}
                  </div>

                  <div className="space-y-5">
                    <SettingsInput icon={Server} id="endpoint" label="Endpoint URL" value={connection.endpoint} onChange={(v) => onChange("endpoint", v)} placeholder="https://..." mono />
                    <SettingsInput icon={Database} id="bucket" label="Bucket Name" value={connection.bucket} onChange={(v) => onChange("bucket", v)} placeholder="mi-bucket" />
                    <div className="grid gap-5 md:grid-cols-2">
                      <SettingsInput id="region" label="Region" value={connection.region} onChange={(v) => onChange("region", v)} placeholder="us-east-1" />
                      <SettingsInput id="prefix" label="Prefix (carpeta)" value={connection.prefix} onChange={(v) => onChange("prefix", v)} placeholder="bills" />
                    </div>

                    <div id="credentials-section" className="border-t border-od-outline-variant pt-5">
                      <h4 className="mb-4 text-sm font-semibold text-od-text">Access Credentials</h4>
                      <div className="space-y-4">
                        <SettingsInput id="access-key" label="Access Key ID" value={connection.accessKeyId} onChange={(v) => onChange("accessKeyId", v)} placeholder="tu_access_key_id" mono />
                        <SettingsInput id="secret-key" label="Secret Access Key" type="password" value={connection.secretAccessKey} onChange={(v) => onChange("secretAccessKey", v)} placeholder="tu_secret_access_key" mono />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg border border-od-outline-variant bg-od-surface-low p-3">
                      <Checkbox checked={connection.forcePathStyle} onCheckedChange={(checked) => onChange("forcePathStyle", Boolean(checked))} />
                      <div>
                        <Label className="text-sm font-medium text-od-text">Force path style</Label>
                        <p className="text-xs text-od-text-muted">
                          Requerido para MinIO, Railway, Backblaze y la mayoría de proveedores alternativos.
                          Desactívalo solo para AWS S3 y DigitalOcean Spaces.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-od-primary">
                      <ShieldCheck className="size-4" aria-hidden />
                      Credenciales en localStorage, nunca en servidor.
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" className="border-od-outline-variant" onClick={handleTest} disabled={testLoading}>
                        {testLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCcw className="size-4" aria-hidden />}
                        Test conexión
                      </Button>
                      <Button type="submit" className="rounded-lg bg-od-primary px-7 text-white hover:bg-od-primary-strong" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCcw className="size-4" aria-hidden />}
                        Listar archivos
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            ) : (
              <div className="rounded-xl border border-od-outline-variant bg-white p-6">
                <h3 className="mb-2 text-lg font-semibold text-od-text">Security</h3>
                <p className="text-sm text-od-text-muted">Próximamente: configuración de permisos de bucket, CORS y políticas IAM.</p>
              </div>
            )}

            {/* Danger zone */}
            <div className="rounded-xl border border-od-error/20 bg-white p-6">
              <h3 className="mb-1 text-base font-semibold text-od-error">Zona de peligro</h3>
              <p className="mb-4 text-sm text-od-text-muted">Borrar las credenciales guardadas y desconectar el bucket actual.</p>
              <Button variant="outline" className="border-od-error/30 text-od-error hover:bg-od-error/5 hover:text-od-error" onClick={onDisconnect}>
                <LockKeyhole className="size-4" aria-hidden />
                Desconectar bucket
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsNav({ icon: Icon, label, active, onClick }: { icon: React.ElementType; label: string; active?: boolean; onClick?: () => void; }) {
  return (
    <div onClick={onClick} className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${active ? "bg-od-secondary-container font-semibold text-od-primary before:absolute before:left-0 before:h-5 before:w-1 before:rounded-full before:bg-od-primary" : "text-od-text-muted hover:bg-od-surface-high"}`}>
      <Icon className="size-4" aria-hidden />
      {label}
    </div>
  );
}

function SettingsInput({ icon: Icon, id, label, value, onChange, placeholder, type = "text", mono }: { icon?: React.ElementType; id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean; }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium text-od-text">{label}</Label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-od-outline" aria-hidden />}
        <Input id={id} autoComplete="off" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`h-10 rounded-lg border-od-outline-variant bg-white ${Icon ? "pl-10" : ""} ${mono ? "font-mono text-xs" : ""} focus:border-od-primary focus:ring-2 focus:ring-od-primary/10`} />
      </div>
    </div>
  );
}

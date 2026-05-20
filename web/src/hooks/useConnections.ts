import { useCallback, useState } from "react";
import { emptyConnection, type S3Connection } from "@/types/s3";

export type SavedConnection = {
  id: string;
  name: string;
  connection: S3Connection;
  createdAt: string;
  lastUsed: string | null;
};

// ── localStorage keys ──────────────────────────────────────────────────────

const CONNECTIONS_KEY = "s3iv_connections";
const ACTIVE_KEY = "s3iv_active_id";
const LEGACY_KEY = "s3iv_connection"; // migrated on first load

// ── persistence helpers ────────────────────────────────────────────────────

function loadSaved(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    return raw ? (JSON.parse(atob(raw)) as SavedConnection[]) : [];
  } catch {
    return [];
  }
}

function persistSaved(list: SavedConnection[]) {
  try {
    localStorage.setItem(CONNECTIONS_KEY, btoa(JSON.stringify(list)));
  } catch { /* storage full — ignore */ }
}

function loadActiveId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

function persistActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* ignore */ }
}

/** Migrates the legacy single-connection key to the new multi-connection list. */
function migrateLegacy(existing: SavedConnection[]): SavedConnection[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw || existing.length > 0) {
      localStorage.removeItem(LEGACY_KEY);
      return existing;
    }
    const conn = { ...emptyConnection, ...JSON.parse(atob(raw)) } as S3Connection;
    const valid = Boolean(conn.accessKeyId && conn.secretAccessKey && conn.region && conn.endpoint && conn.bucket);
    if (!valid) return existing;
    const migrated: SavedConnection = {
      id: crypto.randomUUID(),
      name: conn.bucket || "Conexión importada",
      connection: conn,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };
    localStorage.removeItem(LEGACY_KEY);
    return [migrated];
  } catch {
    return existing;
  }
}

// ── hook ───────────────────────────────────────────────────────────────────

export type UseConnectionsReturn = {
  savedConnections: SavedConnection[];
  activeConnectionId: string | null;
  /** Loads connections from localStorage. Call once on mount. Returns the active connection if any. */
  loadFromStorage: () => SavedConnection | null;
  saveCurrentAsNew: (conn: S3Connection, nameFallback: string) => SavedConnection;
  updateActive: (id: string, conn: S3Connection) => void;
  activate: (id: string) => SavedConnection | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  clearActive: () => void;
};

export function useConnections(): UseConnectionsReturn {
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

  const loadFromStorage = useCallback((): SavedConnection | null => {
    let connections = loadSaved();
    connections = migrateLegacy(connections);
    if (connections.length > 0) persistSaved(connections);
    setSavedConnections(connections);

    const activeId = loadActiveId();
    const active = connections.find((c) => c.id === activeId) ?? connections[0] ?? null;
    if (active) {
      setActiveConnectionId(active.id);
      persistActiveId(active.id);
      return active;
    }
    return null;
  }, []);

  const saveCurrentAsNew = useCallback((conn: S3Connection, nameFallback: string): SavedConnection => {
    const name = window.prompt("Nombre para esta conexión:", nameFallback || conn.bucket || "Nueva conexión");
    const entry: SavedConnection = {
      id: crypto.randomUUID(),
      name: name?.trim() || nameFallback || "Sin nombre",
      connection: { ...conn },
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };
    setSavedConnections((prev) => {
      const next = [...prev, entry];
      persistSaved(next);
      return next;
    });
    setActiveConnectionId(entry.id);
    persistActiveId(entry.id);
    return entry;
  }, []);

  const updateActive = useCallback((id: string, conn: S3Connection) => {
    setSavedConnections((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, connection: { ...conn } } : c);
      persistSaved(next);
      return next;
    });
  }, []);

  const activate = useCallback((id: string): SavedConnection | null => {
    setSavedConnections((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, lastUsed: new Date().toISOString() } : c);
      persistSaved(next);
      return next;
    });
    setActiveConnectionId(id);
    persistActiveId(id);
    return savedConnections.find((c) => c.id === id) ?? null;
  }, [savedConnections]);

  const rename = useCallback((id: string, name: string) => {
    setSavedConnections((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, name } : c);
      persistSaved(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSavedConnections((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persistSaved(next);
      return next;
    });
    setActiveConnectionId((prev) => {
      if (prev === id) { persistActiveId(null); return null; }
      return prev;
    });
  }, []);

  const clearActive = useCallback(() => {
    setActiveConnectionId(null);
    persistActiveId(null);
  }, []);

  return {
    savedConnections,
    activeConnectionId,
    loadFromStorage,
    saveCurrentAsNew,
    updateActive,
    activate,
    rename,
    remove,
    clearActive,
  };
}

/** Format a byte count into a human-readable string (B / KB / MB / GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Format an ISO date string using the es-CO locale. */
export function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Format an ISO date string as a short date only (es-CO). */
export function formatDateShort(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short" }).format(new Date(value));
}

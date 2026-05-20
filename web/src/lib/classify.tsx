import { File, FileImage, FileText } from "lucide-react";
import type { FileType } from "@/types/s3";

/** Returns a human-readable Spanish label for a file type. */
export function typeLabel(type: FileType): string {
  if (type === "image") return "Imagen";
  if (type === "pdf") return "PDF";
  return "Otro";
}

/** Returns a Lucide icon element for a given file type. */
export function typeIcon(type: FileType, className = "size-4"): React.ReactElement {
  if (type === "image") return <FileImage className={className} aria-hidden />;
  if (type === "pdf") return <FileText className={className} aria-hidden />;
  return <File className={className} aria-hidden />;
}

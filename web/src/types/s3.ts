// Canonical TypeScript types — mirror the Go domain/types.go structs.

export type S3Connection = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
};

export type FileType = "image" | "pdf" | "other";

export type ListedS3File = {
  key: string;
  fileName: string;
  extension: string;
  type: FileType;
  size: number;
  lastModified: string | null;
  etag: string | null;
};

export type S3FolderEntry = {
  prefix: string;
  name: string;
};

export type SortField = "score" | "lastModified" | "size" | "fileName";
export type TypeFilter = "all" | FileType;
export type Screen = "dashboard" | "explorer" | "files" | "images" | "settings";
export type ConnectionStatus = "untested" | "connected" | "error";

export const emptyConnection: S3Connection = {
  accessKeyId: "",
  secretAccessKey: "",
  region: "us-east-1",
  endpoint: "",
  bucket: "",
  prefix: "bills",
  forcePathStyle: true,
};

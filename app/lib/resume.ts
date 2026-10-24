/**
 * Résumé upload rules. The file's first bytes decide its type; the name and
 * the browser's claimed type are not trusted.
 */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export const RESUME_TYPES = {
  pdf: { contentType: "application/pdf", extension: "pdf" },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  doc: { contentType: "application/msword", extension: "doc" },
} as const;

export type ResumeKind = keyof typeof RESUME_TYPES;

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

/** Detect PDF, DOCX (a ZIP container) or legacy DOC (an OLE container) from the bytes. */
export function detectResumeKind(bytes: Uint8Array, filename: string): ResumeKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  // DOCX files are ZIP archives; require the extension too, since many formats are ZIPs.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && ext === "docx") return "docx";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && ext === "doc") {
    return "doc";
  }
  return null;
}

export type ResumeCheck =
  | { ok: true; kind: ResumeKind; contentType: string; filename: string }
  | { ok: false; error: string };

export function checkResume(bytes: Uint8Array, filename: string): ResumeCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "Choose your résumé file." };
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    return { ok: false, error: "Your résumé must be 5 MB or smaller." };
  }
  const kind = detectResumeKind(bytes, filename);
  if (!kind)
    return { ok: false, error: "Upload your résumé as a PDF or Word file (.pdf, .docx or .doc)." };
  return {
    ok: true,
    kind,
    contentType: RESUME_TYPES[kind].contentType,
    filename: safeFilename(filename, RESUME_TYPES[kind].extension),
  };
}

/** A download-safe name: letters, digits, spaces, dots, dashes and underscores only. */
export function safeFilename(name: string, extension: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 80);
  return `${base || "resume"}.${extension}`;
}

/** Where résumés are stored. R2 in the Worker; an in-memory fake in tests. */
export interface ResumeStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(keys: string[]): Promise<void>;
}

export function r2ResumeStore(bucket: R2Bucket): ResumeStore {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      return object ? { body: object.body, size: object.size } : null;
    },
    async delete(keys) {
      if (keys.length > 0) await bucket.delete(keys);
    },
  };
}

/**
 * Files an applicant may attach: a PDF or Word résumé, or photos of one.
 * The file's first bytes decide its type; the name and the browser's claimed
 * type are not trusted. Photos lose their metadata (GPS location, camera
 * details) before they are stored; only the rotation flag is kept.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 3;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export const FILE_TYPES = {
  pdf: { contentType: "application/pdf", extension: "pdf", image: false },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    image: false,
  },
  jpeg: { contentType: "image/jpeg", extension: "jpg", image: true },
  png: { contentType: "image/png", extension: "png", image: true },
} as const;

export type FileKind = keyof typeof FILE_TYPES;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

/** Detect the file type from its bytes (and, for ZIP/OLE containers, its extension). */
export function detectFileKind(bytes: Uint8Array, filename: string): FileKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // DOCX files are ZIP archives; require the extension too, since many formats are ZIPs.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && ext === "docx") return "docx";
  // Old .doc files are not accepted: they can carry macros, and every current
  // word processor saves .docx (which cannot run them).
  return null;
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** Reads the Orientation tag (1–8) from an EXIF APP1 payload, if present. */
function exifOrientation(app1: Uint8Array): number | null {
  // "Exif\0\0" then a TIFF header.
  if (!startsWith(app1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00])) return null;
  const tiff = app1.subarray(6);
  if (tiff.byteLength < 8) return null;
  const little = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const ifd = u32(4);
  if (ifd + 2 > tiff.byteLength) return null;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > tiff.byteLength) return null;
    if (u16(at) === 0x0112) {
      const value = u16(at + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A minimal EXIF block holding only the Orientation tag (big-endian TIFF). */
function orientationApp1(orientation: number) {
  const payload = [
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00, // "Exif\0\0"
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // TIFF header, IFD at 8
    0x00,
    0x01, // one entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00, // Orientation
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
  ];
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

const ICC_PROFILE = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00];

/** Application segments needed to show the photo: JFIF, colour profile, Adobe colour info. */
function keepAppSegment(marker: number, payload: Uint8Array) {
  return (
    marker === 0xe0 || marker === 0xee || (marker === 0xe2 && startsWith(payload, ICC_PROFILE))
  );
}

/**
 * Rebuilds a JPEG from only what is needed to show it: image data, tables,
 * JFIF/Adobe headers and the colour profile, plus a minimal rotation flag.
 * Everything else goes: EXIF and XMP (GPS, camera, dates), IPTC, comments,
 * MPF and other application blocks wherever they appear (also between the
 * scans of progressive photos), and anything after the end-of-image marker
 * (motion-photo video, extra images). Returns null if the file is malformed.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;
  const kept: Uint8Array[] = [];
  let orientation: number | null = null;
  let sawScan = false;
  let i = 2;
  for (;;) {
    if (i + 1 >= bytes.byteLength) {
      // Some encoders omit the end marker; accept that only after image data.
      if (!sawScan) return null;
      break;
    }
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      kept.push(bytes.subarray(i, i + 2)); // end of image; nothing after it is kept
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > bytes.byteLength) return null;
    const end = i + 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    if (end < i + 4 || end > bytes.byteLength) return null;
    const payload = bytes.subarray(i + 4, end);
    if (marker === 0xda) {
      // Start of scan: keep its header and the compressed data, which runs to
      // the next marker that is not a stuffed 0xFF00 or a restart marker.
      sawScan = true;
      let j = end;
      for (;;) {
        j = bytes.indexOf(0xff, j);
        if (j === -1 || j + 1 >= bytes.byteLength) {
          j = bytes.byteLength;
          break;
        }
        const next = bytes[j + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) j += 2;
        else if (next === 0xff) j += 1;
        else break;
      }
      kept.push(bytes.subarray(i, j));
      i = j;
      continue;
    }
    if (marker >= 0xe0 && marker <= 0xef) {
      if (marker === 0xe1) orientation ??= exifOrientation(payload);
      else if (keepAppSegment(marker, payload)) kept.push(bytes.subarray(i, end));
    } else if (marker !== 0xfe) {
      kept.push(bytes.subarray(i, end)); // tables, frame headers; comments (0xFE) are dropped
    }
    i = end;
  }
  const head = [bytes.subarray(0, 2)];
  if (orientation && orientation !== 1) head.push(orientationApp1(orientation));
  return concat([...head, ...kept]);
}

/** Removes text, time and EXIF chunks from a PNG. Returns null if malformed. */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const drop = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  while (i + 12 <= bytes.byteLength) {
    const length = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const end = i + 12 + length;
    if (end > bytes.byteLength) return null;
    if (!drop.has(type)) kept.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(kept);
}

export type FileCheck =
  | { ok: true; kind: FileKind; contentType: string; filename: string; bytes: Uint8Array }
  | { ok: false; error: string };

export function checkFile(bytes: Uint8Array, filename: string): FileCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "One of the files is empty." };
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: "Each file must be 5 MB or smaller." };
  }
  const kind = detectFileKind(bytes, filename);
  if (!kind) {
    return {
      ok: false,
      error: "Attach a PDF or Word file (.pdf or .docx) or a photo (JPG or PNG).",
    };
  }
  const clean =
    kind === "jpeg" ? stripJpegMetadata(bytes) : kind === "png" ? stripPngMetadata(bytes) : bytes;
  if (!clean)
    return { ok: false, error: "One of the photos could not be read. Try another photo." };
  return {
    ok: true,
    kind,
    contentType: FILE_TYPES[kind].contentType,
    filename: safeFilename(filename, FILE_TYPES[kind].extension),
    bytes: clean,
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

/** Where application files are stored. R2 in the Worker; an in-memory fake in tests. */
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

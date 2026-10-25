import { describe, expect, it } from "vitest";
import {
  checkFile,
  detectFileKind,
  MAX_FILE_BYTES,
  safeFilename,
  stripJpegMetadata,
  stripPngMetadata,
} from "~/lib/resume";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function segment(marker: number, payload: number[]) {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

/** EXIF block (little-endian TIFF) with Orientation and a fake GPS pointer tag. */
function exif(orientation: number) {
  return [
    ...ascii("Exif\0\0"),
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00, // TIFF header, IFD0 at 8
    0x02,
    0x00, // two entries
    0x12,
    0x01,
    0x03,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x25,
    0x88,
    0x04,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x26,
    0x00,
    0x00,
    0x00, // GPS IFD pointer
    0x00,
    0x00,
    0x00,
    0x00,
    ...ascii("GPS 14.33N 121.08E"),
  ];
}

function jpeg(orientation: number | null) {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    ...(orientation ? segment(0xe1, exif(orientation)) : []),
    ...segment(0xfe, ascii("taken in Brgy. Canlalay")),
    ...segment(0xdb, [0x00, ...new Array(64).fill(1)]),
    ...segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    0x12,
    0x34,
    0x56,
    0xff,
    0x00,
    0x78,
    0xff,
    0xd9,
  ]);
}

const has = (bytes: Uint8Array, text: string) =>
  new TextDecoder("latin1").decode(bytes).includes(text);

function png(chunks: [string, number[]][]) {
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [type, data] of chunks) {
    const n = data.length;
    out.push(
      n >>> 24,
      (n >> 16) & 0xff,
      (n >> 8) & 0xff,
      n & 0xff,
      ...ascii(type),
      ...data,
      0,
      0,
      0,
      0,
    );
  }
  return new Uint8Array(out);
}

describe("application files", () => {
  it("recognises PDF, Word and photos by their bytes", () => {
    expect(detectFileKind(pdf, "cv.pdf")).toBe("pdf");
    expect(detectFileKind(pdf, "renamed.txt")).toBe("pdf");
    expect(detectFileKind(zip, "cv.docx")).toBe("docx");
    expect(detectFileKind(jpeg(null), "IMG_0001.HEIC")).toBe("jpeg");
    expect(detectFileKind(png([["IHDR", [0]]]), "scan")).toBe("png");
  });

  it("rejects other files, even with a résumé-like name", () => {
    expect(detectFileKind(new TextEncoder().encode("<html>"), "cv.pdf")).toBeNull();
    expect(detectFileKind(zip, "photos.zip")).toBeNull();
    expect(detectFileKind(ole, "sheet.xls")).toBeNull();
    // Legacy Word files can carry macros, so they are refused too.
    expect(detectFileKind(ole, "cv.doc")).toBeNull();
    expect(
      detectFileKind(new Uint8Array([0, 0, 0, 0x18, ...ascii("ftypheic")]), "a.heic"),
    ).toBeNull();
    expect(detectFileKind(new Uint8Array(ascii("RIFF\0\0\0\0WEBPVP8 ")), "a.webp")).toBeNull();
  });

  it("enforces the size limit and rejects empty files", () => {
    expect(checkFile(new Uint8Array(), "cv.pdf")).toMatchObject({ ok: false });
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(pdf);
    expect(checkFile(big, "cv.pdf")).toMatchObject({ ok: false });
    expect(checkFile(pdf, "Juan Dela Cruz CV.pdf")).toMatchObject({
      ok: true,
      kind: "pdf",
      contentType: "application/pdf",
      filename: "Juan Dela Cruz CV.pdf",
    });
  });

  it("removes location and other metadata from JPEG photos but keeps the rotation", () => {
    const original = jpeg(6);
    expect(has(original, "GPS 14.33N")).toBe(true);
    const clean = stripJpegMetadata(original)!;
    expect(has(clean, "GPS")).toBe(false);
    expect(has(clean, "Canlalay")).toBe(false);
    expect(has(clean, "JFIF")).toBe(true);
    // Only a minimal EXIF block with Orientation = 6 remains.
    expect(has(clean, "Exif")).toBe(true);
    // Tag 0x0112, type SHORT, count 1, then the big-endian value.
    const at = clean.findIndex((b, i) => b === 0x12 && clean[i - 1] === 0x01);
    expect([...clean.slice(at + 1, at + 9)]).toEqual([0x00, 0x03, 0, 0, 0, 1, 0x00, 6]);
    // Image data after the start of scan is unchanged.
    expect([...clean.slice(-8)]).toEqual([0x12, 0x34, 0x56, 0xff, 0x00, 0x78, 0xff, 0xd9]);
  });

  it("drops EXIF entirely when the photo is already upright", () => {
    expect(has(stripJpegMetadata(jpeg(1))!, "Exif")).toBe(false);
    expect(has(stripJpegMetadata(jpeg(null))!, "Exif")).toBe(false);
  });

  it("drops data after the end of the image (motion-photo video, extra images)", () => {
    const withTrailer = new Uint8Array([...jpeg(null), ...ascii("ftypmp42 GPS 14.33N motion")]);
    const clean = stripJpegMetadata(withTrailer)!;
    expect(has(clean, "motion")).toBe(false);
    expect([...clean.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it("drops metadata between the scans of a progressive JPEG", () => {
    const scan = (data: number[]) => [
      ...segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
      ...data,
    ];
    const progressive = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xdb, [0x00, ...new Array(64).fill(1)]),
      ...scan([0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]),
      ...segment(0xe1, ascii("Exif\0\0GPS hidden")),
      ...segment(0xc4, [0x00, 0x01]),
      ...scan([0x44]),
      0xff,
      0xd9,
    ]);
    const clean = stripJpegMetadata(progressive)!;
    expect(has(clean, "GPS hidden")).toBe(false);
    // Both scans survive, including stuffed bytes and restart markers.
    expect(has(clean, "\x11\xff\x00\x22\xff\xd0\x33")).toBe(true);
    expect(clean.filter((b, i) => b === 0xff && clean[i + 1] === 0xda)).toHaveLength(2);
  });

  it("keeps the colour profile but drops other application blocks", () => {
    const photo = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xe2, ascii("ICC_PROFILE\0\x01\x01colours")),
      ...segment(0xe2, ascii("MPF\0second image")),
      ...segment(0xeb, ascii("JP C2PA author=Juan")),
      ...segment(0xed, ascii("Photoshop 3.0 IPTC")),
      ...segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
      0x12,
      0xff,
      0xd9,
    ]);
    const clean = stripJpegMetadata(photo)!;
    expect(has(clean, "colours")).toBe(true);
    expect(has(clean, "second image")).toBe(false);
    expect(has(clean, "author=Juan")).toBe(false);
    expect(has(clean, "IPTC")).toBe(false);
  });

  it("rejects malformed JPEGs instead of storing them with metadata", () => {
    const broken = jpeg(6).slice(0, 30);
    expect(stripJpegMetadata(broken)).toBeNull();
    expect(checkFile(broken, "photo.jpg")).toMatchObject({ ok: false });
  });

  it("removes text, time and EXIF chunks from PNGs", () => {
    const original = png([
      ["IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]],
      ["tEXt", ascii("Location\0Binan")],
      ["eXIf", ascii("MM\0*GPS")],
      ["IDAT", [1, 2, 3]],
      ["IEND", []],
    ]);
    const clean = stripPngMetadata(original)!;
    expect(has(clean, "tEXt")).toBe(false);
    expect(has(clean, "eXIf")).toBe(false);
    expect(has(clean, "IHDR")).toBe(true);
    expect(has(clean, "IDAT")).toBe(true);
    expect(has(clean, "IEND")).toBe(true);
  });

  it("makes download-safe file names", () => {
    expect(safeFilename('Résumé "Niño"\r\n<script>.pdf', "pdf")).toBe("Resume Nino script.pdf");
    expect(safeFilename("../../etc/passwd", "pdf")).toBe("passwd.pdf");
    expect(safeFilename("C:\\Users\\me\\cv final.docx", "docx")).toBe("cv final.docx");
    expect(safeFilename("???.docx", "docx")).toBe("resume.docx");
  });
});

describe("a real camera-style JPEG", () => {
  it("loses its GPS and camera details but keeps its rotation", async () => {
    const { readFileSync } = await import("node:fs");
    const photo = new Uint8Array(readFileSync("tests/e2e/fixtures/cv-photo-with-gps.jpg"));
    const decode = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
    expect(decode(photo)).toContain("TestPhone");
    const clean = stripJpegMetadata(photo)!;
    expect(decode(clean)).not.toContain("TestPhone");
    expect(decode(clean)).toContain("Exif");
    expect(clean.byteLength).toBeLessThan(photo.byteLength);
  });
});

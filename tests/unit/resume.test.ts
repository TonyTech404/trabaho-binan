import { describe, expect, it } from "vitest";
import { checkResume, detectResumeKind, MAX_RESUME_BYTES, safeFilename } from "~/lib/resume";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

describe("résumé checks", () => {
  it("recognises PDF, DOCX and DOC by their bytes", () => {
    expect(detectResumeKind(pdf, "cv.pdf")).toBe("pdf");
    expect(detectResumeKind(pdf, "renamed.txt")).toBe("pdf");
    expect(detectResumeKind(zip, "cv.docx")).toBe("docx");
    expect(detectResumeKind(ole, "cv.doc")).toBe("doc");
  });

  it("rejects other files, even with a résumé-like name", () => {
    expect(detectResumeKind(new TextEncoder().encode("<html>"), "cv.pdf")).toBeNull();
    expect(detectResumeKind(zip, "photos.zip")).toBeNull();
    expect(detectResumeKind(ole, "sheet.xls")).toBeNull();
  });

  it("enforces the size limit and an empty file", () => {
    expect(checkResume(new Uint8Array(), "cv.pdf")).toMatchObject({ ok: false });
    const big = new Uint8Array(MAX_RESUME_BYTES + 1);
    big.set(pdf);
    expect(checkResume(big, "cv.pdf")).toMatchObject({ ok: false });
    expect(checkResume(pdf, "Juan Dela Cruz CV.pdf")).toEqual({
      ok: true,
      kind: "pdf",
      contentType: "application/pdf",
      filename: "Juan Dela Cruz CV.pdf",
    });
  });

  it("makes download-safe file names", () => {
    expect(safeFilename('Résumé "Niño"\r\n<script>.pdf', "pdf")).toBe("Resume Nino script.pdf");
    expect(safeFilename("../../etc/passwd", "pdf")).toBe("passwd.pdf");
    expect(safeFilename("C:\\Users\\me\\cv final.docx", "docx")).toBe("cv final.docx");
    expect(safeFilename("???.docx", "docx")).toBe("resume.docx");
  });
});

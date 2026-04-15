/**
 * PDF text extraction helpers built on top of `pdf-parse` (v2.x).
 *
 * pdf-parse 2.x is a rewritten ESM/CJS package that exposes a class-based
 * `PDFParse` API — `new PDFParse({ data }).getText()` returns a `TextResult`
 * with a concatenated `text` string and a `total` page count. This supersedes
 * the legacy v1 default-export callable that had the well-known
 * "runs a debug test on import" quirk, so no subpath import workaround is
 * needed on this version.
 *
 * All helpers swallow errors and return safe defaults (empty string or 0),
 * logging the underlying error via `console.error`. Callers that need richer
 * error handling should add it at the call site.
 */

import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";

/**
 * Read a PDF from disk and return its extracted plain text.
 * Returns an empty string if the file cannot be read or parsed.
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath);
    return await extractTextFromBuffer(buffer);
  } catch (err) {
    console.error(`[pdf] extractTextFromPDF failed for ${filePath}:`, err);
    return "";
  }
}

/**
 * Extract plain text from an in-memory PDF buffer.
 * Returns an empty string if parsing fails.
 */
export async function extractTextFromBuffer(buffer: Buffer): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text ?? "";
  } catch (err) {
    console.error("[pdf] extractTextFromBuffer failed:", err);
    return "";
  } finally {
    if (parser) {
      // Best-effort cleanup; ignore errors from destroy()
      try {
        await parser.destroy();
      } catch {
        /* noop */
      }
    }
  }
}

/**
 * Count the pages in a PDF on disk. Returns 0 if the file cannot be read or
 * parsed — callers should treat 0 as "unknown / failed".
 */
export async function getPDFPageCount(filePath: string): Promise<number> {
  let parser: PDFParse | null = null;
  try {
    const buffer = await readFile(filePath);
    parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo();
    return info.total ?? 0;
  } catch (err) {
    console.error(`[pdf] getPDFPageCount failed for ${filePath}:`, err);
    return 0;
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        /* noop */
      }
    }
  }
}

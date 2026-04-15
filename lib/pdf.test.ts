/**
 * Tests for lib/pdf.ts — PDF text extraction helpers.
 *
 * These tests run against a real PDF on disk (lib/__fixtures__/sample.pdf)
 * rather than mocks — the point of this module is to exercise pdf-parse,
 * so mocking it away would defeat the purpose. The fixture is a tiny
 * single-page PDF generated with pdfkit containing the literal text
 * "Hello Distill" and is committed into the repo.
 *
 * Error paths (missing file, invalid buffer) log to console.error by
 * design, so we silence that channel for the duration of the suite to
 * keep test output clean.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  extractTextFromPDF,
  extractTextFromBuffer,
  getPDFPageCount,
} from "./pdf";

// ─── Fixture location ────────────────────────────────────────────────────────

const FIXTURE_DIR = join(__dirname, "__fixtures__");
const SAMPLE_PDF = join(FIXTURE_DIR, "sample.pdf");

// ─── Silence error logging from expected failure paths ─────────────────────

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  errorSpy.mockRestore();
});

// ─── extractTextFromPDF ─────────────────────────────────────────────────────

describe("extractTextFromPDF", () => {
  it("returns a non-empty string for a valid PDF on disk", async () => {
    const text = await extractTextFromPDF(SAMPLE_PDF);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("extracted text contains the fixture's embedded phrase", async () => {
    const text = await extractTextFromPDF(SAMPLE_PDF);
    // The committed fixture was generated with pdfkit and contains this phrase.
    // A loose contains-check keeps the test resilient to whitespace quirks
    // from the extractor.
    expect(text.toLowerCase()).toContain("hello distill");
  });

  it("returns an empty string when the file does not exist", async () => {
    const text = await extractTextFromPDF(
      join(FIXTURE_DIR, "does-not-exist-xyz.pdf"),
    );
    expect(text).toBe("");
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ─── extractTextFromBuffer ──────────────────────────────────────────────────

describe("extractTextFromBuffer", () => {
  it("returns extracted text for a valid buffer", async () => {
    const buffer = readFileSync(SAMPLE_PDF);
    const text = await extractTextFromBuffer(buffer);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("hello distill");
  });

  it("returns an empty string for an invalid buffer", async () => {
    const bogus = Buffer.from("this is definitely not a pdf", "utf8");
    const text = await extractTextFromBuffer(bogus);
    expect(text).toBe("");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns an empty string for an empty buffer", async () => {
    const empty = Buffer.alloc(0);
    const text = await extractTextFromBuffer(empty);
    expect(text).toBe("");
  });
});

// ─── getPDFPageCount ────────────────────────────────────────────────────────

describe("getPDFPageCount", () => {
  it("returns a positive integer for a valid PDF", async () => {
    const count = await getPDFPageCount(SAMPLE_PDF);
    expect(typeof count).toBe("number");
    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("returns 1 for the single-page fixture", async () => {
    // The committed fixture is a single-page PDF, so we can be specific here.
    const count = await getPDFPageCount(SAMPLE_PDF);
    expect(count).toBe(1);
  });

  it("returns 0 when the file does not exist", async () => {
    const count = await getPDFPageCount(
      join(FIXTURE_DIR, "does-not-exist-xyz.pdf"),
    );
    expect(count).toBe(0);
    expect(errorSpy).toHaveBeenCalled();
  });
});

import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  savePDFSource,
  readAllPages,
  writePage,
  rebuildIndex,
  appendLog,
  appendTokenUsage,
} from "@/lib/wiki-fs";
import { extractTextFromBuffer } from "@/lib/pdf";
import { classifyPDFs, ingestSource } from "@/lib/compiler";
import type { Paper } from "@/lib/papers";

/**
 * Upload one or more PDFs into an EXISTING brain.
 *
 * Pipeline:
 *   1. Resolve brain by ID (404 if missing).
 *   2. Save every PDF to raw/pdfs/.
 *   3. Extract text from each PDF; skip-with-warning on empty results.
 *   4. classifyPDFs on text previews for titles.
 *   5. For each classified PDF with extracted text, adapt to a Paper-like
 *      object and call `ingestSource` against current pages — identical
 *      pattern to the existing /ingest route.
 *   6. Write updated/created pages, rebuild index.
 *
 * Individual extraction or ingest failures are logged and skipped so the
 * pipeline keeps going. Catastrophic errors return 500.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files");

    const pdfFiles = files.filter(
      (f): f is File =>
        typeof f === "object" && f !== null && "arrayBuffer" in f
    );

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        { error: "at least one PDF file is required" },
        { status: 400 }
      );
    }

    // ── Step 1: save raw PDFs + buffer them for extraction ──────────────
    const savedFiles: Array<{ filename: string; buffer: Buffer }> = [];
    for (const file of pdfFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        savePDFSource(brain.path, file.name, buffer);
        savedFiles.push({ filename: file.name, buffer });
      } catch (err: any) {
        appendLog(
          brain.path,
          "warn",
          `Failed to save PDF ${file.name}: ${err?.message || String(err)}`
        );
      }
    }
    appendLog(
      brain.path,
      "upload",
      `Saved ${savedFiles.length} PDF${savedFiles.length === 1 ? "" : "s"} to raw/pdfs/`
    );

    // ── Step 2: extract text from each PDF ──────────────────────────────
    const extracted: Array<{ filename: string; text: string }> = [];
    for (const { filename, buffer } of savedFiles) {
      let text = "";
      try {
        text = await extractTextFromBuffer(buffer);
      } catch (err: any) {
        appendLog(
          brain.path,
          "warn",
          `PDF text extraction threw for ${filename}: ${err?.message || String(err)}`
        );
        text = "";
      }
      if (!text || text.trim().length === 0) {
        appendLog(
          brain.path,
          "warn",
          `PDF text extraction returned empty for ${filename} — PDF kept, skipped from pipeline`
        );
        continue;
      }
      extracted.push({ filename, text });
    }
    appendLog(
      brain.path,
      "extract",
      `Extracted text from ${extracted.length}/${savedFiles.length} PDF${savedFiles.length === 1 ? "" : "s"}`
    );

    // ── Step 3: classify PDFs ───────────────────────────────────────────
    let classifications: Array<{ filename: string; title: string }> = [];
    if (extracted.length > 0) {
      try {
        const previews = extracted.map((e) => ({
          filename: e.filename,
          textPreview: e.text.slice(0, 500),
        }));
        const { result, usage } = await classifyPDFs(previews);
        classifications = result.map((c) => ({
          filename: c.filename,
          title: c.title,
        }));
        appendTokenUsage(brain.path, "ingest", usage);
        appendLog(
          brain.path,
          "classify",
          `Classified ${classifications.length} PDF${classifications.length === 1 ? "" : "s"}`
        );
      } catch (err: any) {
        appendLog(
          brain.path,
          "warn",
          `classifyPDFs failed: ${err?.message || String(err)} — falling back to filename as title`
        );
        classifications = extracted.map((e) => ({
          filename: e.filename,
          title: e.filename,
        }));
      }
    }

    // ── Step 4: capture the slug set BEFORE ingest for updated/created tally
    const preIngestPages = readAllPages(brain.path);
    const preIngestSlugs = new Set(preIngestPages.map((p) => p.id));

    // ── Step 5: ingest each PDF via ingestSource (matches /ingest route)
    // Track touched pages — final updated/created counts come from comparing
    // post-ingest slugs against the pre-ingest snapshot.
    const touchedPageIds = new Set<string>();

    for (const { filename, text } of extracted) {
      const classification =
        classifications.find((c) => c.filename === filename) ?? {
          filename,
          title: filename,
        };

      const paper: Paper = {
        id: filename,
        title: classification.title,
        authors: [],
        year: null,
        abstract: text.slice(0, 30_000),
        url: "",
        citationCount: 0,
        source_api: "semantic_scholar",
      };

      try {
        const existingPages = readAllPages(brain.path);
        const { result, usage } = await ingestSource(existingPages, paper);
        appendTokenUsage(brain.path, "ingest", usage);

        for (const page of result.updated || []) {
          writePage(brain.path, {
            id: page.id,
            title: page.title,
            type: page.type,
            content: page.content,
            links: page.links,
            sources: page.sources,
          });
          touchedPageIds.add(page.id);
          appendLog(brain.path, "update", `Updated page: ${page.title}`);
        }

        for (const page of result.created || []) {
          writePage(brain.path, {
            id: page.id,
            title: page.title,
            type: page.type,
            content: page.content,
            links: page.links,
            sources: page.sources,
          });
          touchedPageIds.add(page.id);
          appendLog(brain.path, "create", `Created page: ${page.title}`);
        }
      } catch (err: any) {
        appendLog(
          brain.path,
          "warn",
          `ingestSource failed for ${filename}: ${err?.message || String(err)} — continuing`
        );
      }
    }

    // ── Step 6: compute updated/created tallies from slug diff ──────────
    let updated = 0;
    let created = 0;
    for (const id of touchedPageIds) {
      if (preIngestSlugs.has(id)) updated++;
      else created++;
    }

    rebuildIndex(brain.path, brain.topic);
    appendLog(
      brain.path,
      "upload",
      `Upload pipeline complete: ${savedFiles.length} files, ${updated} updated, ${created} created`
    );

    return NextResponse.json({
      filesUploaded: savedFiles.length,
      updated,
      created,
    });
  } catch (error: any) {
    console.error("Per-brain upload error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to upload PDFs to brain" },
      { status: 500 }
    );
  }
}

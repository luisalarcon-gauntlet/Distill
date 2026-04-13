import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  readAllPages,
  writePage,
  rebuildIndex,
  appendLog,
  saveRawSource,
} from "@/lib/wiki-fs";
import {
  searchAllSources,
  getPaperByArxivId,
  paperRawId,
  paperToRawMarkdown,
  type Paper,
} from "@/lib/papers";
import { ingestSource } from "@/lib/compiler";

/**
 * Ingest one or more papers into an existing brain. Accepts two shapes:
 *
 *   { papers: Paper[] }                 — batch ingest (new review flow)
 *   { query?: string, arxivId?: string } — single-paper lookup (legacy)
 *
 * For each paper: save the raw source, call the LLM via `ingestSource`
 * to update existing pages and mint new ones, write everything, and
 * rebuild the index at the end.
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

    const body = await request.json();

    // ── Resolve papers to ingest ──────────────────────────────────
    let papers: Paper[] = [];

    if (Array.isArray(body.papers) && body.papers.length > 0) {
      papers = body.papers;
    } else if (body.arxivId) {
      const paper = await getPaperByArxivId(body.arxivId);
      if (paper) papers = [paper];
    } else if (body.query) {
      // Legacy path: find the single best match via combined search.
      const results = await searchAllSources(body.query, 1);
      if (results.length > 0) papers = [results[0]];
    }

    if (papers.length === 0) {
      return NextResponse.json(
        { error: "No papers provided or found" },
        { status: 404 }
      );
    }

    // ── Save raw sources ──────────────────────────────────────────
    for (const paper of papers) {
      const rawId = paperRawId(paper);
      const rawContent = paperToRawMarkdown(paper);
      saveRawSource(brain.path, rawId, rawContent);
      appendLog(brain.path, "ingest", `Saved source: ${paper.title}`);
    }

    // ── Run LLM ingest for each paper, sequentially ──────────────
    // We reload existing pages between iterations so later papers see
    // the updates from earlier ones in the same batch.
    let totalUpdated = 0;
    let totalCreated = 0;

    for (const paper of papers) {
      const existingPages = readAllPages(brain.path);
      const result = await ingestSource(existingPages, paper);

      for (const page of result.updated || []) {
        writePage(brain.path, {
          id: page.id,
          title: page.title,
          type: page.type,
          content: page.content,
          links: page.links,
          sources: page.sources,
        });
        appendLog(brain.path, "update", `Updated page: ${page.title}`);
        totalUpdated++;
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
        appendLog(brain.path, "create", `Created page: ${page.title}`);
        totalCreated++;
      }
    }

    rebuildIndex(brain.path, brain.topic);

    return NextResponse.json({
      ingested: papers.length,
      updated: totalUpdated,
      created: totalCreated,
    });
  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to ingest paper" },
      { status: 500 }
    );
  }
}

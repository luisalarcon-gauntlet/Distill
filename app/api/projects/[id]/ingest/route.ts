import { NextRequest, NextResponse } from "next/server";
import { getPages, upsertPage, addSource, addLog } from "@/lib/db";
import { getPaperByArxivId, searchPapers } from "@/lib/papers";
import { ingestSource } from "@/lib/compiler";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { query, arxivId } = await req.json();

    // Find the paper
    let paper;
    if (arxivId) {
      paper = await getPaperByArxivId(arxivId);
    } else if (query) {
      const results = await searchPapers(query, 1);
      paper = results[0] || null;
    }

    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    // Store source
    addSource(params.id, {
      id: paper.id,
      title: paper.title,
      authors: paper.authors.join(", "),
      year: paper.year || 0,
      abstract: paper.abstract,
      url: paper.url,
      citation_count: paper.citationCount,
    });

    addLog(params.id, "ingest", `Ingesting: ${paper.title}`);

    // Get existing pages and run ingest
    const existingPages = getPages(params.id);
    const result = await ingestSource(existingPages, paper);

    // Apply updates
    for (const page of result.updated) {
      upsertPage(params.id, {
        id: page.id,
        title: page.title,
        type: page.type,
        content: page.content,
        links: page.links || [],
        source_count: page.source_count || 0,
      });
      addLog(params.id, "update", `Updated: ${page.title}`);
    }

    for (const page of result.created) {
      upsertPage(params.id, {
        id: page.id,
        title: page.title,
        type: page.type,
        content: page.content,
        links: page.links || [],
        source_count: page.source_count || 0,
      });
      addLog(params.id, "create", `Created: ${page.title}`);
    }

    addLog(params.id, "ingest_complete", `Ingested "${paper.title}" — ${result.updated.length} updated, ${result.created.length} created`);

    return NextResponse.json({
      paper: paper.title,
      updated: result.updated.length,
      created: result.created.length,
    });
  } catch (e: any) {
    console.error("Ingest error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

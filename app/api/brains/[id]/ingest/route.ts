import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  readAllPages,
  writePage,
  rebuildIndex,
  appendLog,
  saveRawSource,
} from "@/lib/wiki-fs";
import { searchPapers, getPaperByArxivId } from "@/lib/papers";
import { ingestSource } from "@/lib/compiler";

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
    const { query, arxivId } = body;

    // Find the paper
    let paper = null;
    if (arxivId) {
      paper = await getPaperByArxivId(arxivId);
    } else if (query) {
      const results = await searchPapers(query, 1);
      paper = results[0] || null;
    }

    if (!paper) {
      return NextResponse.json(
        { error: "No paper found for the given query" },
        { status: 404 }
      );
    }

    // Save raw source
    const rawContent = `# ${paper.title}\n\n**Authors:** ${paper.authors.join(", ")}\n**Year:** ${paper.year || "n.d."}\n**Citations:** ${paper.citationCount}\n**URL:** ${paper.url}\n\n## Abstract\n\n${paper.abstract || "No abstract available."}`;
    const rawId = paper.id.replace(/[^a-zA-Z0-9-]/g, "-");
    saveRawSource(brain.path, rawId, rawContent);
    appendLog(brain.path, "ingest", `Saved source: ${paper.title}`);

    // Run ingest via LLM
    const existingPages = readAllPages(brain.path);
    const result = await ingestSource(existingPages, paper);

    // Write updated pages
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
    }

    // Write new pages
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
    }

    rebuildIndex(brain.path, brain.topic);

    return NextResponse.json({
      paper: { title: paper.title, id: paper.id },
      updated: (result.updated || []).length,
      created: (result.created || []).length,
    });
  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to ingest paper" },
      { status: 500 }
    );
  }
}

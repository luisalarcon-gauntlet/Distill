import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  writePage,
  rebuildIndex,
  appendLog,
  saveRawSource,
} from "@/lib/wiki-fs";
import { compileWiki } from "@/lib/compiler";
import { paperRawId, paperToRawMarkdown, type Paper } from "@/lib/papers";

/**
 * Compile a brain's wiki from a curated list of papers. This is step 2
 * of the create flow — step 1 (POST /api/brains) creates the folder
 * and searches; the user then reviews the results and POSTs the subset
 * they want here for the LLM to synthesize.
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
    const papers: Paper[] = Array.isArray(body.papers) ? body.papers : [];

    // Empty compile is legal — the user might just want a scaffold.
    if (papers.length === 0) {
      appendLog(brain.path, "compile", "Compile requested with 0 papers — scaffold only");
      return NextResponse.json({ pageCount: 0, sourceCount: 0 });
    }

    // Save each curated paper as a raw source with full frontmatter.
    for (const paper of papers) {
      const rawId = paperRawId(paper);
      const rawContent = paperToRawMarkdown(paper);
      saveRawSource(brain.path, rawId, rawContent);
    }
    appendLog(
      brain.path,
      "ingest",
      `Saved ${papers.length} raw source${papers.length === 1 ? "" : "s"}`
    );

    // Generate wiki pages via the LLM.
    const result = await compileWiki(brain.topic, papers);
    const pages = result.pages;

    let pageCount = 0;
    for (const [pageId, page] of Object.entries(pages)) {
      writePage(brain.path, {
        id: pageId,
        title: page.title,
        type: page.type,
        content: page.content,
        links: page.links,
        sources: page.sources,
      });
      appendLog(brain.path, "create", `Created page: ${page.title}`);
      pageCount++;
    }

    rebuildIndex(brain.path, brain.topic);
    appendLog(
      brain.path,
      "compile",
      `Wiki compiled: ${pageCount} pages from ${papers.length} sources`
    );

    return NextResponse.json({ pageCount, sourceCount: papers.length });
  } catch (error: any) {
    console.error("Compile brain error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to compile brain" },
      { status: 500 }
    );
  }
}

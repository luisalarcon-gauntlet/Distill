import { NextRequest, NextResponse } from "next/server";
import { searchPapers } from "@/lib/papers";
import { compileWiki } from "@/lib/compiler";
import { createProject, upsertPage, addSource, addLog } from "@/lib/db";

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export async function POST(req: NextRequest) {
  try {
    const { topic } = await req.json();
    if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });

    // 1. Search for papers
    const papers = await searchPapers(topic, 10);
    if (papers.length === 0) {
      return NextResponse.json({ error: "No papers found for this topic" }, { status: 404 });
    }

    // 2. Create project
    const projectId = slug(topic) + "-" + Date.now().toString(36);
    createProject(projectId, topic, topic);

    // 3. Store sources
    for (const p of papers) {
      addSource(projectId, {
        id: p.id,
        title: p.title,
        authors: p.authors.join(", "),
        year: p.year || 0,
        abstract: p.abstract,
        url: p.url,
        citation_count: p.citationCount,
      });
    }

    addLog(projectId, "search", `Found ${papers.length} papers for "${topic}"`);

    // 4. Compile wiki via LLM
    const wiki = await compileWiki(topic, papers);

    // 5. Store pages
    for (const page of Object.values(wiki.pages)) {
      upsertPage(projectId, {
        id: page.id,
        title: page.title,
        type: page.type,
        content: page.content,
        links: page.links || [],
        source_count: page.source_count || 0,
      });
      addLog(projectId, "compile", `Created page: ${page.title}`);
    }

    addLog(projectId, "complete", `Wiki compiled with ${Object.keys(wiki.pages).length} pages from ${papers.length} sources`);

    return NextResponse.json({
      projectId,
      pageCount: Object.keys(wiki.pages).length,
      sourceCount: papers.length,
    });
  } catch (e: any) {
    console.error("Generate error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

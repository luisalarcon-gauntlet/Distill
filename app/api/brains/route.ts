import { NextResponse } from "next/server";
import {
  listBrains,
  registerBrain,
  generateBrainId,
  setLastActive,
} from "@/lib/config";
import { initWikiDir, writePage, rebuildIndex, appendLog } from "@/lib/wiki-fs";
import { searchPapers } from "@/lib/papers";
import { compileWiki } from "@/lib/compiler";
import path from "path";

export async function GET() {
  try {
    const brains = listBrains();
    return NextResponse.json({ brains });
  } catch (error: any) {
    console.error("List brains error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list brains" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, topic, directory, autoCompile = true } = body;

    if (!name || !topic || !directory) {
      return NextResponse.json(
        { error: "name, topic, and directory are required" },
        { status: 400 }
      );
    }

    const id = generateBrainId(name);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const brainPath = path.join(directory, slug);

    // Initialize the wiki folder structure
    initWikiDir(brainPath, topic);

    let pageCount = 0;
    let sourceCount = 0;

    if (autoCompile) {
      // Search for papers
      const papers = await searchPapers(topic, 10);
      sourceCount = papers.length;

      if (papers.length > 0) {
        appendLog(brainPath, "search", `Found ${papers.length} papers for "${topic}"`);

        // Save raw sources
        for (const paper of papers) {
          const rawContent = `# ${paper.title}\n\n**Authors:** ${paper.authors.join(", ")}\n**Year:** ${paper.year || "n.d."}\n**Citations:** ${paper.citationCount}\n**URL:** ${paper.url}\n\n## Abstract\n\n${paper.abstract || "No abstract available."}`;
          const rawId = paper.id.replace(/[^a-zA-Z0-9-]/g, "-");
          const fs = await import("fs");
          const rawDir = path.join(brainPath, "raw");
          if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
          fs.writeFileSync(
            path.join(rawDir, `${rawId}.md`),
            rawContent,
            "utf-8"
          );
        }

        // Compile wiki via LLM
        const result = await compileWiki(topic, papers);
        const pages = result.pages;

        for (const [pageId, page] of Object.entries(pages)) {
          writePage(brainPath, {
            id: pageId,
            title: page.title,
            type: page.type,
            content: page.content,
            links: page.links,
            sources: page.sources,
          });
          appendLog(brainPath, "compile", `Created page: ${page.title}`);
          pageCount++;
        }

        rebuildIndex(brainPath, topic);
        appendLog(brainPath, "compile", `Wiki compiled: ${pageCount} pages from ${sourceCount} sources`);
      }
    }

    const now = new Date().toISOString();
    const brain = {
      id,
      name,
      path: brainPath,
      topic,
      created: now,
      lastOpened: now,
    };

    registerBrain(brain);

    return NextResponse.json({ brain, pageCount, sourceCount });
  } catch (error: any) {
    console.error("Create brain error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create brain" },
      { status: 500 }
    );
  }
}

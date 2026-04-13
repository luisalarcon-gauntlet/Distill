import { NextResponse } from "next/server";
import {
  listBrains,
  registerBrain,
  generateBrainId,
} from "@/lib/config";
import { initWikiDir, appendLog } from "@/lib/wiki-fs";
import { searchAllSources } from "@/lib/papers";
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

/**
 * Create a brain folder, search for papers across all sources, and
 * return them for user review. Compilation is now a separate step
 * (POST /api/brains/[id]/compile) so the user can curate the source
 * list before the LLM writes anything.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, topic, directory } = body;

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

    // Initialize the wiki folder structure on disk.
    initWikiDir(brainPath, topic);

    // Search for papers across all three sources. No wiki generation yet.
    const papers = await searchAllSources(topic, 10);
    appendLog(
      brainPath,
      "search",
      `Found ${papers.length} papers across Semantic Scholar, arXiv, OpenAlex`
    );

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

    return NextResponse.json({
      brain,
      papers,
      status: "pending_review",
    });
  } catch (error: any) {
    console.error("Create brain error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create brain" },
      { status: 500 }
    );
  }
}

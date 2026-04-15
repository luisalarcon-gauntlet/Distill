import { NextResponse } from "next/server";
import {
  listBrains,
  registerBrain,
  generateBrainId,
} from "@/lib/config";
import { initWikiDir, appendLog } from "@/lib/wiki-fs";
import { searchAllSources } from "@/lib/papers";
import path from "path";
import os from "os";

const ALLOWED_ROOTS = (process.env.BROWSE_ALLOWED_ROOTS || os.homedir())
  .split(":")
  .map((r) => path.resolve(r));

function isPathAllowed(p: string): boolean {
  const resolved = path.resolve(p);
  return ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );
}

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
    const { name, topic, directory, sourceCount } = body;

    if (!name || !topic || !directory) {
      return NextResponse.json(
        { error: "name, topic, and directory are required" },
        { status: 400 }
      );
    }

    const limit =
      typeof sourceCount === "number" && sourceCount > 0
        ? Math.floor(sourceCount)
        : 20;

    const id = generateBrainId(name);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const brainPath = path.join(directory, slug);

    if (!isPathAllowed(brainPath)) {
      return NextResponse.json(
        { error: "Brain path must be inside an allowed directory" },
        { status: 403 }
      );
    }

    // Initialize the wiki folder structure on disk.
    initWikiDir(brainPath, topic);

    // Search for papers across all three sources. No wiki generation yet.
    const papers = await searchAllSources(topic, limit);
    appendLog(
      brainPath,
      "search",
      `Found ${papers.length} papers across Semantic Scholar, arXiv, OpenAlex (requested ${limit})`
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

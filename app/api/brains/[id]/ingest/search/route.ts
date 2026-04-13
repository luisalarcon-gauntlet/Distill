import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { searchAllSources } from "@/lib/papers";

/**
 * Search-only endpoint — no side effects, no LLM, no disk writes.
 * Used by the sidebar ingest flow to preview candidates before the
 * user picks which ones to actually pull into the wiki.
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
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    const papers = await searchAllSources(query, 5);
    return NextResponse.json({ papers });
  } catch (error: any) {
    console.error("Ingest search error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search papers" },
      { status: 500 }
    );
  }
}

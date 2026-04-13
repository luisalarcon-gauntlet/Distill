import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { getTokenSummary } from "@/lib/wiki-fs";

/**
 * GET /api/brains/[id]/tokens
 * Returns aggregated token usage and cost estimates for a brain.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const summary = getTokenSummary(brain.path);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("Token summary error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get token summary" },
      { status: 500 }
    );
  }
}

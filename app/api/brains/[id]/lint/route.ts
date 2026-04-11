import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { readAllPages, appendLog } from "@/lib/wiki-fs";
import { lintWiki } from "@/lib/compiler";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const pages = readAllPages(brain.path);
    const result = await lintWiki(pages);

    appendLog(
      brain.path,
      "lint",
      `Found ${result.issues.length} issues, ${result.suggestions.length} suggestions`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Lint error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to lint wiki" },
      { status: 500 }
    );
  }
}

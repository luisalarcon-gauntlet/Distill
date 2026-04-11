import { NextRequest, NextResponse } from "next/server";
import { getPages, addLog } from "@/lib/db";
import { lintWiki } from "@/lib/compiler";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pages = getPages(params.id);
    if (pages.length === 0) {
      return NextResponse.json({ error: "No pages to lint" }, { status: 404 });
    }

    addLog(params.id, "lint", "Running wiki health check...");
    const result = await lintWiki(pages);
    addLog(params.id, "lint_complete", `Found ${result.issues.length} issues, ${result.suggestions.length} suggestions`);

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

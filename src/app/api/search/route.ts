import { NextRequest, NextResponse } from "next/server";
import { searchPapers } from "@/lib/papers";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ error: "Missing query param ?q=" }, { status: 400 });

  try {
    const papers = await searchPapers(query, 10);
    return NextResponse.json({ papers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

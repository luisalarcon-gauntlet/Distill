import { NextRequest, NextResponse } from "next/server";
import { getProject, getPages, getSources, getLog } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const project = getProject(params.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const pages = getPages(params.id);
  const sources = getSources(params.id);
  const log = getLog(params.id);

  return NextResponse.json({ project, pages, sources, log });
}

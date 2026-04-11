import { NextResponse } from "next/server";
import { listProjects } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

import { NextResponse } from "next/server";
import { getBrain, removeBrain, setLastActive } from "@/lib/config";
import { readAllPages, readLog } from "@/lib/wiki-fs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    setLastActive(params.id);
    const pages = readAllPages(brain.path);
    const log = readLog(brain.path);

    return NextResponse.json({ brain, pages, log });
  } catch (error: any) {
    console.error("Get brain error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load brain" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    removeBrain(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete brain error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to remove brain" },
      { status: 500 }
    );
  }
}

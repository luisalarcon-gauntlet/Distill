import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const SKIP_DIRS = new Set([
  "node_modules",
  "__pycache__",
  ".git",
  ".next",
  ".cache",
  "$Recycle.Bin",
  "System Volume Information",
  "Recovery",
  "PerfLogs",
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get("path") || os.homedir();
    const current = path.resolve(rawPath);
    const parent = path.dirname(current) !== current ? path.dirname(current) : null;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    const dirs: { name: string; path: string }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(current, entry.name);
      try {
        fs.accessSync(fullPath, fs.constants.R_OK);
        dirs.push({ name: entry.name, path: fullPath });
      } catch {
        // skip unreadable dirs
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ current, parent, dirs });
  } catch (error: any) {
    console.error("Browse error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to browse directory" },
      { status: 500 }
    );
  }
}

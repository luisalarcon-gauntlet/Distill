import { NextResponse } from "next/server";
import fs from "fs";
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

    if (!isPathAllowed(current)) {
      return NextResponse.json(
        { error: "Path is outside the allowed directory" },
        { status: 403 }
      );
    }

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

export async function POST(request: Request) {
  try {
    const { parent, name } = await request.json();
    if (!parent || !name) {
      return NextResponse.json({ error: "parent and name are required" }, { status: 400 });
    }

    // Sanitize folder name
    const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
    if (!safeName) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }

    const fullPath = path.join(path.resolve(parent), safeName);

    if (!isPathAllowed(fullPath)) {
      return NextResponse.json(
        { error: "Path is outside the allowed directory" },
        { status: 403 }
      );
    }

    if (fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "Folder already exists" }, { status: 409 });
    }

    fs.mkdirSync(fullPath, { recursive: true });
    return NextResponse.json({ path: fullPath });
  } catch (error: any) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create folder" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const tmpDir = os.tmpdir();
    const archiveName = `${brain.id}.tar.gz`;
    const archivePath = path.join(tmpDir, archiveName);

    // Create tar.gz of the brain directory — use spawnSync with args array
    // to avoid shell interpolation of user-derived paths.
    const brainParent = path.dirname(brain.path);
    const brainFolder = path.basename(brain.path);
    const result = spawnSync("tar", ["-czf", archivePath, "-C", brainParent, brainFolder], {
      stdio: "ignore",
    });
    if (result.status !== 0) {
      throw new Error(`tar exited with status ${result.status}`);
    }

    const fileBuffer = fs.readFileSync(archivePath);

    // Clean up temp file
    try {
      fs.unlinkSync(archivePath);
    } catch {
      // ignore cleanup errors
    }

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${archiveName}"`,
      },
    });
  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to export brain" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { execSync } from "child_process";
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

    // Create tar.gz of the brain directory
    const brainParent = path.dirname(brain.path);
    const brainFolder = path.basename(brain.path);
    execSync(`tar -czf "${archivePath}" -C "${brainParent}" "${brainFolder}"`, {
      stdio: "ignore",
    });

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

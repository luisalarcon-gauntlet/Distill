import { NextResponse } from "next/server";
import { extractTextFromBuffer } from "@/lib/pdf";
import { parseSyllabus } from "@/lib/compiler";

/**
 * POST /api/syllabus/parse
 *
 * Accepts a multipart/form-data upload with a single "file" field (PDF).
 * Extracts text from the PDF, calls parseSyllabus, and returns the
 * CurriculumStructure — without creating a brain or writing any files.
 *
 * This is the "skim your syllabus" moment: fast, read-only, stateless.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    // T-03-01: Validate presence and type before any processing
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "A PDF file is required" },
        { status: 400 }
      );
    }

    // Accept if content-type signals PDF OR the filename ends with .pdf
    const contentType = file.type || "";
    const filename =
      file instanceof File ? file.name : (formData.get("filename") as string | null) ?? "";
    const isPDF =
      contentType.startsWith("application/pdf") ||
      filename.toLowerCase().endsWith(".pdf");

    if (!isPDF) {
      return NextResponse.json(
        { error: "A PDF file is required" },
        { status: 400 }
      );
    }

    // Convert to Buffer for pdf.ts helpers
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text — extractTextFromBuffer swallows parse errors and returns ""
    const text = await extractTextFromBuffer(buffer);
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF. Try a text-based PDF." },
        { status: 422 }
      );
    }

    // Parse the syllabus via LLM (5-15 second operation)
    const { result } = await parseSyllabus(text);

    return NextResponse.json({ curriculum: result });
  } catch (err: any) {
    // T-03-03: Return generic message to client; full error is logged server-side only
    console.error("[syllabus/parse] Unexpected error:", err);
    return NextResponse.json(
      { error: `Parse failed: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}

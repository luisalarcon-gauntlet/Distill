import { NextResponse } from "next/server";
import path from "path";
import {
  generateBrainId,
  registerBrain,
  type BrainConfig,
} from "@/lib/config";
import {
  initWikiDir,
  savePDFSource,
  writePage,
  rebuildIndex,
  appendLog,
  appendTokenUsage,
} from "@/lib/wiki-fs";
import { extractTextFromBuffer } from "@/lib/pdf";
import {
  classifyPDFs,
  parseSyllabus,
  compileCurriculum,
  type PDFClassification,
  type CurriculumStructure,
} from "@/lib/compiler";
import { searchAllSources } from "@/lib/papers";

/**
 * Create a curriculum brain from a batch of uploaded PDFs.
 *
 * Pipeline:
 *   1. Initialize brain folder + register.
 *   2. Save every PDF to raw/pdfs/ (kept even if extraction later fails).
 *   3. Extract text from each PDF; skip-with-warning on empty results.
 *   4. classifyPDFs (LLM) — every file with any text gets a classification.
 *   5. parseSyllabus (LLM) on the first classification.type === "syllabus".
 *   6. compileCurriculum (LLM) — produces the full wiki pages object.
 *   7. writePage each output page, then rebuildIndex.
 *
 * Individual LLM-step failures are caught and logged so the endpoint still
 * returns a useful brain on partial success. Only catastrophic errors
 * (e.g. failure to create the directory) return 500.
 */
export async function POST(request: Request) {
  let brainPath: string | null = null;

  try {
    const formData = await request.formData();

    const name = formData.get("name");
    const topic = formData.get("topic");
    const directory = formData.get("directory");
    const files = formData.getAll("files");

    const topicStr = typeof topic === "string" ? topic.trim() : "";

    if (
      typeof name !== "string" ||
      !name ||
      typeof directory !== "string" ||
      !directory
    ) {
      return NextResponse.json(
        { error: "name and directory are required" },
        { status: 400 }
      );
    }

    const pdfFiles = files.filter(
      (f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f
    );

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        { error: "at least one PDF file is required" },
        { status: 400 }
      );
    }

    // ── Step 1: create brain folder + register ────────────────────────────
    const id = generateBrainId(name);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    brainPath = path.join(directory, slug);

    initWikiDir(brainPath, topicStr);

    const now = new Date().toISOString();
    const brain: BrainConfig = {
      id,
      name,
      path: brainPath,
      topic: topicStr,
      created: now,
      lastOpened: now,
    };
    registerBrain(brain);

    appendLog(
      brainPath,
      "upload",
      `Brain created from ${pdfFiles.length} uploaded PDF${pdfFiles.length === 1 ? "" : "s"}`
    );

    // ── Step 2: save raw PDFs + buffer them for extraction ────────────────
    const savedFiles: Array<{ filename: string; buffer: Buffer }> = [];
    for (const file of pdfFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        savePDFSource(brainPath, file.name, buffer);
        savedFiles.push({ filename: file.name, buffer });
      } catch (err: any) {
        appendLog(
          brainPath,
          "warn",
          `Failed to save PDF ${file.name}: ${err?.message || String(err)}`
        );
      }
    }
    appendLog(
      brainPath,
      "upload",
      `Saved ${savedFiles.length} PDF${savedFiles.length === 1 ? "" : "s"} to raw/pdfs/`
    );

    // ── Step 3: extract text from each PDF ────────────────────────────────
    const extracted: Array<{ filename: string; text: string }> = [];
    for (const { filename, buffer } of savedFiles) {
      let text = "";
      try {
        text = await extractTextFromBuffer(buffer);
      } catch (err: any) {
        appendLog(
          brainPath,
          "warn",
          `PDF text extraction threw for ${filename}: ${err?.message || String(err)}`
        );
        text = "";
      }
      if (!text || text.trim().length === 0) {
        appendLog(
          brainPath,
          "warn",
          `PDF text extraction returned empty for ${filename} — PDF kept, skipped from pipeline`
        );
        continue;
      }
      extracted.push({ filename, text });
    }
    appendLog(
      brainPath,
      "extract",
      `Extracted text from ${extracted.length}/${savedFiles.length} PDF${savedFiles.length === 1 ? "" : "s"}`
    );

    // ── Step 4: classify PDFs ─────────────────────────────────────────────
    let classifications: PDFClassification[] = [];
    try {
      const previews = extracted.map((e) => ({
        filename: e.filename,
        textPreview: e.text.slice(0, 500),
      }));
      const { result, usage } = await classifyPDFs(previews);
      classifications = result;
      appendTokenUsage(brainPath, "compile", usage);
      appendLog(
        brainPath,
        "classify",
        `Classified ${classifications.length} PDF${classifications.length === 1 ? "" : "s"}`
      );
    } catch (err: any) {
      appendLog(
        brainPath,
        "warn",
        `classifyPDFs failed: ${err?.message || String(err)} — falling back to "other" for all`
      );
      classifications = extracted.map((e) => ({
        filename: e.filename,
        type: "other" as const,
        lectureNumber: null,
        title: e.filename,
      }));
    }

    // ── Step 5: parse syllabus (if any) ───────────────────────────────────
    let courseInfo: CurriculumStructure = {
      courseName: name,
      courseCode: null,
      instructor: null,
      semester: null,
      units: [],
    };
    let syllabusFound = false;

    const syllabusClassification = classifications.find(
      (c) => c.type === "syllabus"
    );
    if (syllabusClassification) {
      const syllabusFile = extracted.find(
        (e) => e.filename === syllabusClassification.filename
      );
      if (syllabusFile) {
        try {
          const { result, usage } = await parseSyllabus(syllabusFile.text);
          courseInfo = result;
          syllabusFound = true;
          appendTokenUsage(brainPath, "compile", usage);
          appendLog(
            brainPath,
            "syllabus",
            `Parsed syllabus from ${syllabusFile.filename}: ${courseInfo.courseName}`
          );
          if (courseInfo.courseName && (!brain.topic || brain.topic === "")) {
            brain.topic = courseInfo.courseName;
            registerBrain(brain);
            appendLog(
              brainPath,
              "syllabus",
              `Auto-populated brain topic from syllabus: ${courseInfo.courseName}`
            );
          }
        } catch (err: any) {
          appendLog(
            brainPath,
            "warn",
            `parseSyllabus failed for ${syllabusFile.filename}: ${err?.message || String(err)}`
          );
        }
      }
    } else {
      appendLog(
        brainPath,
        "syllabus",
        `No syllabus detected — using minimal CurriculumStructure for "${name}"`
      );
    }

    // ── Step 6: compile curriculum ────────────────────────────────────────
    const classifiedPDFs = classifications
      .map((c) => {
        const ext = extracted.find((e) => e.filename === c.filename);
        return ext
          ? { classification: c, extractedText: ext.text }
          : null;
      })
      .filter(
        (x): x is { classification: PDFClassification; extractedText: string } =>
          x !== null && x.extractedText.length > 0
      );

    let pages: Record<
      string,
      {
        id: string;
        title: string;
        type: "overview" | "concept" | "entity" | "source" | "analysis" | "lecture";
        content: string;
        links: string[];
        sources: string[];
      }
    > = {};
    try {
      const { result, usage } = await compileCurriculum(
        courseInfo,
        classifiedPDFs
      );
      pages = result.pages;
      appendTokenUsage(brainPath, "compile", usage);
      appendLog(
        brainPath,
        "compile",
        `Curriculum compiled: ${Object.keys(pages).length} pages generated`
      );
    } catch (err: any) {
      appendLog(
        brainPath,
        "warn",
        `compileCurriculum failed: ${err?.message || String(err)} — no wiki pages written`
      );
    }

    // ── Step 7: write pages + rebuild index ───────────────────────────────
    let pagesGenerated = 0;
    for (const [pageId, page] of Object.entries(pages)) {
      try {
        writePage(brainPath, {
          id: pageId,
          title: page.title,
          type: page.type,
          content: page.content,
          links: page.links,
          sources: page.sources,
        });
        appendLog(brainPath, "create", `Created page: ${page.title}`);
        pagesGenerated++;
      } catch (err: any) {
        appendLog(
          brainPath,
          "warn",
          `writePage failed for ${pageId}: ${err?.message || String(err)}`
        );
      }
    }

    rebuildIndex(brainPath, brain.topic);
    appendLog(
      brainPath,
      "upload",
      `Upload pipeline complete: ${pagesGenerated} pages, syllabusFound=${syllabusFound}`
    );

    // ── Tally classified counts by type ───────────────────────────────────
    const classifiedCounts: Record<string, number> = {};
    for (const c of classifications) {
      classifiedCounts[c.type] = (classifiedCounts[c.type] || 0) + 1;
    }

    // ── Search papers if the user provided an explicit topic ──────────────
    let papers: Awaited<ReturnType<typeof searchAllSources>> = [];
    if (topicStr) {
      try {
        papers = await searchAllSources(topicStr, 10);
        appendLog(
          brainPath,
          "search",
          `Found ${papers.length} papers for topic "${topicStr}"`
        );
      } catch (err: any) {
        appendLog(
          brainPath,
          "warn",
          `searchAllSources failed: ${err?.message || String(err)}`
        );
      }
    }

    return NextResponse.json({
      brain,
      pipeline: {
        filesUploaded: savedFiles.length,
        syllabusFound,
        courseName: courseInfo.courseName,
        classified: classifiedCounts,
        pagesGenerated,
      },
      papers,
    });
  } catch (error: any) {
    console.error("Upload brain error:", error);
    if (brainPath) {
      try {
        appendLog(
          brainPath,
          "error",
          `Upload pipeline failed: ${error?.message || String(error)}`
        );
      } catch {
        /* noop */
      }
    }
    return NextResponse.json(
      { error: error?.message || "Failed to upload brain" },
      { status: 500 }
    );
  }
}

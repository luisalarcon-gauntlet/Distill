/**
 * Wiki Compiler
 * Takes papers and generates/updates interlinked wiki pages via LLM.
 * This is the core of Distill — the "compiled wiki" pattern.
 */

import { llmJSON, type TokenUsage } from "./llm";
import type { Paper } from "./papers";
import type { WikiPage } from "./wiki-fs";

export interface PDFClassification {
  filename: string;
  type: "syllabus" | "lecture" | "problem-set" | "exam" | "reading" | "other";
  lectureNumber: number | null;
  title: string;
}

export interface CurriculumStructure {
  courseName: string;
  courseCode: string | null;
  instructor: string | null;
  semester: string | null;
  units: Array<{
    title: string;
    lectures: Array<{
      number: number;
      title: string;
      topics: string[];
    }>;
  }>;
}

const ZERO_USAGE: TokenUsage = { input_tokens: 0, output_tokens: 0 };

interface CompilerPage {
  id: string;
  title: string;
  type: "overview" | "concept" | "entity" | "source" | "analysis";
  content: string;
  links: string[];
  sources: string[];
}

interface WikiCompilation {
  pages: Record<string, CompilerPage>;
}

const SYSTEM_PROMPT = `You are a knowledge wiki compiler. Your job is to take academic papers and compile them into a structured, interlinked wiki.

Rules:
- Every page must use [[Page Title]] syntax to link to other pages in the wiki
- Page IDs must be kebab-case slugs (e.g., "attention-mechanism")
- Content should be substantive: 3-6 paragraphs per page, with real technical detail
- Cross-reference heavily — the value is in the connections
- Flag contradictions or tensions between papers explicitly
- Use markdown formatting: ## for sections, **bold** for key terms, \`code\` for math/formulas
- Be opinionated about what matters — don't just summarize, synthesize

Page types:
- overview: The main topic page. Synthesizes all sources into a coherent narrative.
- concept: A key idea, technique, or method. Explains what it is and how it relates to other concepts.
- entity: A specific model, dataset, system, or organization. Factual and detailed.
- source: A summary of a specific paper. Includes key contributions, methods, findings, and significance.
- analysis: A cross-cutting comparison or deeper investigation.

Return ONLY valid JSON, no markdown fences.`;

/**
 * Generate a full wiki from a topic and set of papers.
 */
export async function compileWiki(
  topic: string,
  papers: Paper[]
): Promise<{ result: { pages: Record<string, CompilerPage> }; usage: TokenUsage }> {
  const paperContext = papers
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}" (${p.year || "n.d."}) by ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""}\nAbstract: ${p.abstract || "No abstract available."}\nCitations: ${p.citationCount}`
    )
    .join("\n\n");

  const prompt = `Compile a knowledge wiki about "${topic}" from these ${papers.length} papers:

${paperContext}

Generate a JSON object with this exact structure:
{
  "pages": {
    "page-id": {
      "id": "page-id",
      "title": "Page Title",
      "type": "overview|concept|entity|source",
      "content": "Markdown content with [[Wiki Links]]",
      "links": ["linked-page-id", ...],
      "sources": ["paper-title-or-id", ...]
    }
  }
}

Requirements:
- Create 1 overview page
- Create 3-6 concept/entity pages for the most important ideas
- Create 2-3 source pages for the most cited/important papers
- Every page must link to at least 2 other pages
- The overview must link to all other pages
- Total: 6-10 pages`;

  const { data, usage } = await llmJSON<WikiCompilation>(
    SYSTEM_PROMPT,
    prompt,
    8192
  );
  return { result: data, usage };
}

/**
 * Ingest a new source into an existing wiki — update existing pages and create new ones.
 */
export async function ingestSource(
  existingPages: WikiPage[],
  newPaper: Paper
): Promise<{
  result: { updated: CompilerPage[]; created: CompilerPage[] };
  usage: TokenUsage;
}> {
  const existingContext = existingPages
    .map(
      (p) =>
        `- [${p.id}] "${p.title}" (${p.type}): ${p.content.slice(0, 200)}...`
    )
    .join("\n");

  const prompt = `An existing wiki has these pages:

${existingContext}

A new source has been added:
"${newPaper.title}" (${newPaper.year || "n.d."}) by ${newPaper.authors.slice(0, 4).join(", ")}
Abstract: ${newPaper.abstract}

Generate a JSON object:
{
  "updated": [
    { "id": "existing-page-id", "title": "...", "type": "...", "content": "FULL updated content", "links": [...], "sources": [...] }
  ],
  "created": [
    { "id": "new-page-id", "title": "...", "type": "...", "content": "...", "links": [...], "sources": ["${newPaper.title}"] }
  ]
}

Rules:
- Update the overview page to mention the new source
- Update any concept/entity pages that the new source is relevant to
- Create new pages only if the source introduces genuinely new concepts not covered by existing pages
- Add a source page for the new paper
- Maintain all [[Wiki Links]] and cross-references
- For updated pages, return the COMPLETE new content (not just the diff)`;

  const { data, usage } = await llmJSON<{
    updated: CompilerPage[];
    created: CompilerPage[];
  }>(SYSTEM_PROMPT, prompt, 8192);
  return { result: data, usage };
}

/**
 * Lint the wiki — find issues and suggest improvements.
 */
export async function lintWiki(
  pages: WikiPage[]
): Promise<{
  result: {
    issues: { type: string; description: string; page?: string }[];
    suggestions: string[];
  };
  usage: TokenUsage;
}> {
  const context = pages
    .map(
      (p) =>
        `[${p.id}] "${p.title}" (${p.type}, ${p.links.length} links, ${p.sources.length} sources)\nContent preview: ${p.content.slice(0, 300)}...`
    )
    .join("\n\n");

  const prompt = `Analyze this wiki for issues:

${context}

Return JSON:
{
  "issues": [
    { "type": "orphan|contradiction|stale|gap|missing_link", "description": "...", "page": "page-id" }
  ],
  "suggestions": [
    "Suggested improvement or new page to create..."
  ]
}

Look for:
- Orphan pages with no inbound links
- Contradictions between pages
- Missing cross-references (concepts mentioned but not linked)
- Important topics that deserve their own page
- Pages with too few sources
- Gaps where a web search could fill in missing data`;

  const { data, usage } = await llmJSON<{
    issues: { type: string; description: string; page?: string }[];
    suggestions: string[];
  }>(SYSTEM_PROMPT, prompt, 4096);
  return { result: data, usage };
}

const PDF_CLASSIFIER_SYSTEM = `You are a course-material classifier. You receive a list of PDF files — each with a filename and a short text preview — and must classify them for a curriculum builder.

Classify each PDF into one of these types:
- syllabus: course outline, schedule, or description (a master document for the course)
- lecture: lecture notes, slides, or a reading tied to a specific class session
- problem-set: homework, problem sets, or solutions to problem sets
- exam: midterm, final, quiz, or practice exam
- reading: a supplementary paper, chapter, or article (not a lecture)
- other: anything that does not fit the above

Filename hints:
- "Lec", "Lecture", "L1", "L2" → lecture
- "PS", "HW", "Problem", "Homework" → problem-set
- "Sol", "Solution" → problem-set (solutions are still part of problem sets)
- "Exam", "Midterm", "Final", "Quiz" → exam
- "Syllabus", "Outline", "Schedule" → syllabus

Text content hints:
- Course overview / weekly schedule / grading policy → syllabus
- Problem statements, "Problem 1", "Exercise" → problem-set
- Slide-like structure, section headings tied to one topic → lecture
- A full academic paper abstract + references → reading

For each PDF, extract the lecture number if present in the filename or text (e.g. "Lec5.pdf" → 5, "lecture-12-notes.pdf" → 12, "L03_intro.pdf" → 3). Use null if no lecture number is identifiable.

Generate a short human-readable title for each PDF (e.g. "Lecture 5: Dynamic Programming" or "Problem Set 3").

Return ONLY valid JSON in this exact shape, no markdown fences:
{
  "classifications": [
    { "filename": "...", "type": "lecture", "lectureNumber": 5, "title": "..." }
  ]
}`;

/**
 * Classify a batch of PDFs by filename and text preview.
 *
 * Resilient: if the LLM response is malformed or cannot be parsed, each
 * failing entry falls back to `{ filename, type: "other", lectureNumber: null, title: filename }`.
 */
export async function classifyPDFs(
  previews: Array<{ filename: string; textPreview: string }>
): Promise<{ result: PDFClassification[]; usage: TokenUsage }> {
  if (previews.length === 0) {
    return { result: [], usage: { ...ZERO_USAGE } };
  }

  const prompt = `Classify the following PDFs. Each entry has a filename and a short preview of the text content.

${JSON.stringify(previews, null, 2)}

Return a JSON object with a "classifications" array. Every input PDF must appear in the output, in the same order, with these fields:
- filename: the exact filename from the input
- type: one of "syllabus" | "lecture" | "problem-set" | "exam" | "reading" | "other"
- lectureNumber: integer lecture number, or null
- title: a short human-readable title

Return ONLY the JSON object, no prose.`;

  const fallbackFor = (p: {
    filename: string;
    textPreview: string;
  }): PDFClassification => ({
    filename: p.filename,
    type: "other",
    lectureNumber: null,
    title: p.filename,
  });

  try {
    const { data, usage } = await llmJSON<{
      classifications: unknown;
    }>(PDF_CLASSIFIER_SYSTEM, prompt, 4096);

    const raw = Array.isArray(data?.classifications) ? data.classifications : [];
    const byFilename = new Map<string, PDFClassification>();

    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const filename = typeof e.filename === "string" ? e.filename : null;
      if (!filename) continue;

      const type = e.type;
      const validTypes = [
        "syllabus",
        "lecture",
        "problem-set",
        "exam",
        "reading",
        "other",
      ] as const;
      const safeType = (validTypes as readonly string[]).includes(type as string)
        ? (type as PDFClassification["type"])
        : "other";

      const lectureNumber =
        typeof e.lectureNumber === "number" && Number.isFinite(e.lectureNumber)
          ? Math.trunc(e.lectureNumber)
          : null;

      const title =
        typeof e.title === "string" && e.title.trim().length > 0
          ? e.title
          : filename;

      byFilename.set(filename, {
        filename,
        type: safeType,
        lectureNumber,
        title,
      });
    }

    // Ensure every input PDF has a result (fallback for any missed).
    const result: PDFClassification[] = previews.map(
      (p) => byFilename.get(p.filename) ?? fallbackFor(p)
    );

    return { result, usage };
  } catch {
    // Malformed JSON or network error — return a fallback array with zero usage
    // rather than throwing, so curriculum ingest can still proceed.
    return {
      result: previews.map(fallbackFor),
      usage: { ...ZERO_USAGE },
    };
  }
}

const SYLLABUS_PARSER_SYSTEM = `You are a syllabus parser. You receive the raw text of a course syllabus and must extract its structure for a curriculum builder.

Extract:
- courseName: the full course name (e.g. "Introduction to Algorithms")
- courseCode: the course code if present (e.g. "CS 6.006"), null if absent
- instructor: the primary instructor's name, null if absent
- semester: the semester or term (e.g. "Fall 2024"), null if absent
- units: an ordered list of course units / modules / weeks. Each unit has:
  - title: the unit title
  - lectures: ordered list of lectures in the unit. Each lecture has:
    - number: integer lecture number (use sequential integers if the syllabus does not number them)
    - title: the lecture title
    - topics: a short list of keyword strings covered in that lecture

Rules:
- Lecture numbers must be integers.
- Topics are short keywords or phrases, not full sentences.
- If the syllabus has a flat list of lectures with no units, wrap them in a single unit titled "Course".
- If something is missing from the syllabus, use null (for scalar fields) or [] (for lists) — never invent content.

Return ONLY valid JSON in this exact shape, no markdown fences:
{
  "courseName": "...",
  "courseCode": null,
  "instructor": null,
  "semester": null,
  "units": [
    {
      "title": "...",
      "lectures": [
        { "number": 1, "title": "...", "topics": ["..."] }
      ]
    }
  ]
}`;

/**
 * Parse a syllabus document's raw text into a structured curriculum.
 *
 * Resilient: if the LLM response is malformed, returns a minimal fallback
 * structure rather than throwing.
 */
export async function parseSyllabus(
  syllabusText: string
): Promise<{ result: CurriculumStructure; usage: TokenUsage }> {
  const fallback: CurriculumStructure = {
    courseName: "Untitled Course",
    courseCode: null,
    instructor: null,
    semester: null,
    units: [],
  };

  const prompt = `Parse the following syllabus text into a structured curriculum.

--- SYLLABUS TEXT ---
${syllabusText}
--- END SYLLABUS ---

Return the JSON object described in the system prompt.`;

  try {
    const { data, usage } = await llmJSON<unknown>(
      SYLLABUS_PARSER_SYSTEM,
      prompt,
      4096
    );

    if (!data || typeof data !== "object") {
      return { result: fallback, usage };
    }

    const d = data as Record<string, unknown>;

    const courseName =
      typeof d.courseName === "string" && d.courseName.trim().length > 0
        ? d.courseName
        : "Untitled Course";
    const courseCode = typeof d.courseCode === "string" ? d.courseCode : null;
    const instructor = typeof d.instructor === "string" ? d.instructor : null;
    const semester = typeof d.semester === "string" ? d.semester : null;

    const rawUnits = Array.isArray(d.units) ? d.units : [];
    const units: CurriculumStructure["units"] = [];

    for (const u of rawUnits) {
      if (!u || typeof u !== "object") continue;
      const unit = u as Record<string, unknown>;
      const unitTitle =
        typeof unit.title === "string" && unit.title.trim().length > 0
          ? unit.title
          : "Unit";

      const rawLectures = Array.isArray(unit.lectures) ? unit.lectures : [];
      const lectures: CurriculumStructure["units"][number]["lectures"] = [];

      for (const l of rawLectures) {
        if (!l || typeof l !== "object") continue;
        const lec = l as Record<string, unknown>;
        const number =
          typeof lec.number === "number" && Number.isFinite(lec.number)
            ? Math.trunc(lec.number)
            : null;
        if (number === null) continue;
        const title =
          typeof lec.title === "string" && lec.title.trim().length > 0
            ? lec.title
            : `Lecture ${number}`;
        const topics = Array.isArray(lec.topics)
          ? lec.topics.filter((t): t is string => typeof t === "string")
          : [];
        lectures.push({ number, title, topics });
      }

      units.push({ title: unitTitle, lectures });
    }

    return {
      result: { courseName, courseCode, instructor, semester, units },
      usage,
    };
  } catch {
    return { result: fallback, usage: { ...ZERO_USAGE } };
  }
}

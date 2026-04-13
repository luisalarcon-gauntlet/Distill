/**
 * Wiki Compiler
 * Takes papers and generates/updates interlinked wiki pages via LLM.
 * This is the core of Distill — the "compiled wiki" pattern.
 */

import { llmJSON, type TokenUsage } from "./llm";
import type { Paper } from "./papers";
import type { WikiPage } from "./wiki-fs";

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

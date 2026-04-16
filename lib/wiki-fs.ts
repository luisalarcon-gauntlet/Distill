/**
 * Wiki Filesystem Layer
 * Reads and writes a brain as real .md files on disk.
 * Uses gray-matter for frontmatter parsing/serialization.
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

export type PageType = "overview" | "concept" | "entity" | "source" | "analysis" | "lecture";

export interface WikiPage {
  id: string;
  title: string;
  type: PageType;
  content: string;
  links: string[];
  sources: string[];
  filepath: string;
  created: string;
  updated: string;
}

export interface LogEntry {
  date: string;
  action: string;
  detail: string;
}

export interface RawSourceMeta {
  id: string;
  filepath: string;
  title?: string;
  authors?: string;
  year?: number | string;
  citations?: number;
  url?: string;
  source_api?: string;
  paper_id?: string;
  arxiv_id?: string;
  ingested?: string;
  [key: string]: unknown;
}

/**
 * Subdirectory under the brain root where each page type is stored.
 * Overview is special: it's a single file `wiki/overview.md`.
 */
const TYPE_DIRS: Record<PageType, string> = {
  overview: "wiki",
  concept: "wiki/concepts",
  entity: "wiki/entities",
  source: "wiki/sources",
  analysis: "wiki/analyses",
  lecture: "wiki/lectures",
};

const SCHEMA_TEMPLATE = `# Distill Wiki Schema

**Topic**: {TOPIC}
**Created**: {DATE}

## Page Types

### overview
The main synthesis page. One per brain. Summarizes the entire topic by synthesizing all sources into a coherent narrative. Must link to all major concept and entity pages.

### concept
A key idea, method, technique, or theory. Explains what it is, why it matters, and how it connects to other concepts. Must link to at least 2 other pages.

### entity
A specific model, dataset, system, organization, or person. Factual and detailed. Includes key contributions and relationships to other entities.

### source
A summary of a single paper or article. Covers key contributions, methods, findings, and significance. This is the LLM's interpretation of the raw source — how it connects to the broader topic.

### analysis
A saved answer to a user's question. Created only when the user explicitly chooses to save a query response. Contains the question, the synthesized answer, and citations to wiki pages.

### lecture
A summary of a single lecture from a course curriculum. Covers key topics, concepts introduced, prerequisites from earlier lectures, and connections to other wiki pages. Includes a link to the raw PDF source.

## File Conventions

- **Filenames**: kebab-case, no spaces. Examples: \`attention-mechanism.md\`, \`vaswani-2017-summary.md\`
- **Source pages**: named \`{author}-{year}-summary.md\` to distinguish from raw sources
- **Frontmatter**: every wiki page MUST have YAML frontmatter with these fields:
  \`\`\`yaml
  ---
  title: Page Title
  type: concept|entity|source|overview|analysis
  links: [other-page-id, another-page-id]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  ---
  \`\`\`
  Optional frontmatter: \`sources: [raw-source-id]\` to track which raw sources informed this page.

## Content Conventions

- Use \`[[Page Title]]\` for internal wiki links
- Use \`**bold**\` for key terms on first mention
- Use \`## Heading\` for sections within a page
- Flag contradictions explicitly: \`> ⚠️ Contradiction: [[Page A]] claims X, but [[Page B]] found Y.\`
- When updating a page with new information, preserve existing content — append or revise, never replace wholesale
- Every page should have substantive content: 3-6 paragraphs minimum

## Cross-Referencing Rules

- Every concept page must link to at least 2 other wiki pages
- Every source summary must link to the concepts it discusses
- The overview must link to all major concept and entity pages
- When a new source contradicts an existing claim, note it on BOTH pages
- Prefer specific links over vague ones: link to [[Self-Attention]] not [[concepts]]

## Operations

### On Ingest
1. Read the raw source
2. Create or update \`wiki/sources/{author}-{year}-summary.md\`
3. Update any existing concept/entity pages that the new source is relevant to
4. Create new concept/entity pages if the source introduces genuinely new ideas
5. Update \`wiki/overview.md\` to mention the new source
6. Rebuild \`index.md\`
7. Append to \`log.md\`

### On Query
1. Read \`index.md\` to find relevant pages
2. Read those pages
3. Synthesize an answer with [[wiki links]] as citations
4. If user saves the answer: write to \`wiki/analyses/\`

### On Lint
1. Read all wiki pages
2. Check for: orphan pages, contradictions, missing links, thin pages, gaps
3. Report issues and suggest improvements
`;

/** `YYYY-MM-DD` in local time. */
function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM-DD HH:MM:SS` in local time — the parseable log prefix format. */
function timestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
}

/** Ensure a relative filepath uses forward slashes for display/storage. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Truncate an over-long kebab-case slug to keep filesystem paths manageable
 * (Windows caps paths at 260 chars). Prefers cutting at a word boundary.
 */
function truncateSlug(slug: string, maxLength: number = 50): string {
  if (slug.length <= maxLength) return slug;
  const truncated = slug.slice(0, maxLength);
  const lastDash = truncated.lastIndexOf("-");
  return lastDash > 20 ? truncated.slice(0, lastDash) : truncated;
}

/**
 * Render the initial (empty) `index.md` body.
 * Every category is shown, empty ones marked "(none yet)".
 */
function renderIndexContent(topic: string, grouped: Record<PageType, WikiPage[]>): string {
  const displayTopic = topic && topic.trim() ? topic : "Untitled Brain";
  const sections: Array<{ key: PageType; heading: string }> = [
    { key: "overview", heading: "Overview" },
    { key: "lecture", heading: "Lectures" },
    { key: "concept", heading: "Concepts" },
    { key: "entity", heading: "Entities" },
    { key: "source", heading: "Sources" },
    { key: "analysis", heading: "Analyses" },
  ];

  let body = `\n# ${displayTopic} — Wiki Index\n`;

  for (const { key, heading } of sections) {
    body += `\n## ${heading}\n\n`;
    const pages = grouped[key] || [];
    if (pages.length === 0) {
      body += `_(none yet)_\n`;
      continue;
    }
    const sorted = [...pages].sort((a, b) => a.title.localeCompare(b.title));
    for (const page of sorted) {
      const srcCount = page.sources?.length || 0;
      const suffix =
        key === "source" || key === "analysis"
          ? `— ${key}`
          : `— ${key} (${srcCount} source${srcCount === 1 ? "" : "s"})`;
      body += `- [[${page.title}]] ${suffix}\n`;
    }
  }

  return body;
}

/**
 * Write Obsidian vault config files under `.obsidian/`.
 * Makes the brain folder open cleanly as a vault with useful defaults:
 * - wikilink format matches our `[[Page Title]]` convention
 * - shortest-path resolution finds pages in nested subdirs
 * - raw/, exports/, and SCHEMA.md are hidden from search and graph
 * - graph nodes are color-coded by page type
 */
function writeObsidianConfig(dirPath: string): void {
  const obsidianDir = path.join(dirPath, ".obsidian");

  const appJson = {
    useMarkdownLinks: false,
    newLinkFormat: "shortest",
    showFrontmatter: false,
    readableLineLength: true,
    userIgnoreFilters: ["raw/", "exports/", "SCHEMA.md"],
  };

  const graphJson = {
    colorGroups: [
      { query: "tag:#distill/overview", color: { a: 1, rgb: 12886783 } },
      { query: "tag:#distill/concept", color: { a: 1, rgb: 9487615 } },
      { query: "tag:#distill/entity", color: { a: 1, rgb: 8309402 } },
      { query: "tag:#distill/source", color: { a: 1, rgb: 13936725 } },
      { query: "tag:#distill/analysis", color: { a: 1, rgb: 13920362 } },
    ],
  };

  const appearanceJson = {
    baseFontSize: 16,
    theme: "obsidian",
  };

  fs.writeFileSync(
    path.join(obsidianDir, "app.json"),
    JSON.stringify(appJson, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(obsidianDir, "graph.json"),
    JSON.stringify(graphJson, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(obsidianDir, "appearance.json"),
    JSON.stringify(appearanceJson, null, 2),
    "utf-8"
  );
}

/**
 * Write a top-level README.md that orients users opening the brain in Obsidian.
 */
function writeBrainReadme(dirPath: string, topic: string): void {
  const body = `# ${topic}

This is a [Distill](https://github.com/YOUR_USERNAME/distill) brain.

Open \`index.md\` to browse the wiki, or use Obsidian's graph view to explore connections.

## Structure

- \`wiki/\` — LLM-generated knowledge pages
- \`raw/\` — source documents (papers, articles)
- \`index.md\` — catalog of all wiki pages
- \`log.md\` — timeline of operations
- \`SCHEMA.md\` — wiki conventions

## Quick Links

- [[Index]]
- [[Overview]]
`;
  fs.writeFileSync(path.join(dirPath, "README.md"), body, "utf-8");
}

/**
 * Initialize a new brain directory structure.
 * Creates all subdirectories and seed files (SCHEMA.md, index.md, log.md).
 */
export function initWikiDir(dirPath: string, topic: string): void {
  const effectiveTopic = topic && topic.trim() ? topic : "Untitled Brain";
  const dirs = [
    "",
    "raw",
    "raw/assets",
    "raw/pdfs",
    "wiki",
    "wiki/concepts",
    "wiki/entities",
    "wiki/sources",
    "wiki/analyses",
    "wiki/lectures",
    "exports",
    ".obsidian",
  ];

  for (const dir of dirs) {
    const full = path.join(dirPath, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
  }

  // Seed Obsidian vault config so "Open folder as vault" works out of the box.
  writeObsidianConfig(dirPath);
  writeBrainReadme(dirPath, effectiveTopic);

  const date = today();

  // SCHEMA.md — full template with {TOPIC}/{DATE} replaced
  const schema = SCHEMA_TEMPLATE.replace(/\{TOPIC\}/g, effectiveTopic).replace(
    /\{DATE\}/g,
    date
  );
  fs.writeFileSync(path.join(dirPath, "SCHEMA.md"), schema, "utf-8");

  // index.md — empty skeleton with all categories
  const emptyGrouped: Record<PageType, WikiPage[]> = {
    overview: [],
    concept: [],
    entity: [],
    source: [],
    analysis: [],
    lecture: [],
  };
  const indexBody = renderIndexContent(effectiveTopic, emptyGrouped);
  const indexFile = matter.stringify(indexBody, { title: "Index", updated: date });
  fs.writeFileSync(path.join(dirPath, "index.md"), indexFile, "utf-8");

  // log.md — header plus initial init entry
  const logContent =
    `# Wiki Log\n\n## [${timestamp()}] init | Created brain for "${effectiveTopic}"\n`;
  fs.writeFileSync(path.join(dirPath, "log.md"), logContent, "utf-8");
}

/**
 * Write a wiki page to disk as a markdown file with YAML frontmatter.
 * Returns the relative filepath (posix-style) under the brain root.
 */
export function writePage(
  wikiDir: string,
  page: {
    id: string;
    title: string;
    type: string;
    content: string;
    links?: string[];
    sources?: string[];
    created?: string;
  }
): string {
  const type = (page.type as PageType) in TYPE_DIRS ? (page.type as PageType) : "concept";
  const typeDir = TYPE_DIRS[type];

  const dir = path.join(wikiDir, typeDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Overview is a single fixed file; all other types use `{id}.md`.
  const safeId = truncateSlug(page.id);
  const filename = type === "overview" ? "overview.md" : `${safeId}.md`;
  const relFilepath = toPosix(path.join(typeDir, filename));
  const fullPath = path.join(wikiDir, relFilepath);

  const now = today();

  // Preserve the original created date if the file already exists.
  let created = page.created || now;
  if (fs.existsSync(fullPath)) {
    try {
      const existing = matter(fs.readFileSync(fullPath, "utf-8"));
      if (existing.data.created) created = existing.data.created;
    } catch {
      // ignore parse errors — fall through to `now`
    }
  }

  // Aliases let Obsidian resolve `[[Page Title]]` to `attention-mechanism.md`.
  // Include both the human title and the kebab-case id, deduped.
  const aliases: string[] = [page.title];
  if (page.id && page.id !== page.title) {
    aliases.push(page.id);
  }

  const frontmatter: Record<string, unknown> = {
    title: page.title,
    aliases,
    type,
    tags: [`distill/${type}`],
    links: page.links || [],
    created,
    updated: now,
  };
  // `sources` is optional per the schema — only include it if provided.
  if (page.sources && page.sources.length > 0) {
    frontmatter.sources = page.sources;
  }

  const fileContent = matter.stringify(page.content, frontmatter);
  fs.writeFileSync(fullPath, fileContent, "utf-8");

  return relFilepath;
}

/**
 * Read a single page by its relative filepath (relative to the brain root).
 */
export function readPage(wikiDir: string, filepath: string): WikiPage | null {
  const fullPath = path.join(wikiDir, filepath);
  if (!fs.existsSync(fullPath)) return null;

  try {
    const raw = fs.readFileSync(fullPath, "utf-8");
    const parsed = matter(raw);
    const id = path.basename(filepath, ".md");

    return {
      id,
      title: parsed.data.title || id,
      type: (parsed.data.type as PageType) || "concept",
      content: parsed.content.trim(),
      links: parsed.data.links || [],
      sources: parsed.data.sources || [],
      filepath: toPosix(filepath),
      created: parsed.data.created || "",
      updated: parsed.data.updated || "",
    };
  } catch {
    return null;
  }
}

/**
 * Recursively read all .md files under `wiki/` and return them as WikiPage[].
 */
export function readAllPages(wikiDir: string): WikiPage[] {
  const wikiPath = path.join(wikiDir, "wiki");
  if (!fs.existsSync(wikiPath)) return [];

  const pages: WikiPage[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const relative = toPosix(path.relative(wikiDir, full));
        const page = readPage(wikiDir, relative);
        if (page) pages.push(page);
      }
    }
  }

  walk(wikiPath);
  return pages;
}

/**
 * Rebuild `index.md` from all current wiki pages.
 * Grouped by type; empty sections render as "(none yet)".
 */
export function rebuildIndex(wikiDir: string, topic: string): void {
  const pages = readAllPages(wikiDir);

  const grouped: Record<PageType, WikiPage[]> = {
    overview: [],
    concept: [],
    entity: [],
    source: [],
    analysis: [],
    lecture: [],
  };
  for (const page of pages) {
    if (grouped[page.type]) grouped[page.type].push(page);
  }

  const body = renderIndexContent(topic, grouped);
  const fileContent = matter.stringify(body, {
    title: "Index",
    updated: today(),
  });

  fs.writeFileSync(path.join(wikiDir, "index.md"), fileContent, "utf-8");
}

/**
 * Append a timestamped entry to `log.md`.
 * Format: `## [YYYY-MM-DD HH:MM:SS] {action} | {detail}`
 */
export function appendLog(
  wikiDir: string,
  action: string,
  detail: string
): void {
  const logPath = path.join(wikiDir, "log.md");
  const entry = `\n## [${timestamp()}] ${action} | ${detail}\n`;

  if (fs.existsSync(logPath)) {
    fs.appendFileSync(logPath, entry, "utf-8");
  } else {
    fs.writeFileSync(logPath, `# Wiki Log\n${entry}`, "utf-8");
  }
}

/**
 * Parse `log.md` into structured entries (newest last, file order preserved).
 */
export function readLog(wikiDir: string): LogEntry[] {
  const logPath = path.join(wikiDir, "log.md");
  if (!fs.existsSync(logPath)) return [];

  const raw = fs.readFileSync(logPath, "utf-8");
  const entries: LogEntry[] = [];

  // Match either the ISO timestamps written by older code or the new
  // `YYYY-MM-DD HH:MM:SS` format. The capture simply grabs whatever is
  // between the brackets.
  const regex = /^## \[(.+?)\] (.+?) \| (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    entries.push({
      date: match[1],
      action: match[2],
      detail: match[3].trim(),
    });
  }

  return entries;
}

/**
 * Save a raw source document to `raw/{id}.md`. Raw sources are immutable
 * once written — callers should never re-save or mutate them.
 */
export function saveRawSource(
  wikiDir: string,
  id: string,
  content: string
): string {
  const rawDir = path.join(wikiDir, "raw");
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  const relFilepath = toPosix(path.join("raw", `${id}.md`));
  fs.writeFileSync(path.join(wikiDir, relFilepath), content, "utf-8");
  return relFilepath;
}

/**
 * List all raw sources under `raw/` with their frontmatter metadata.
 * Ignores `raw/assets/` and any non-.md files.
 */
export function listRawSources(wikiDir: string): RawSourceMeta[] {
  const rawDir = path.join(wikiDir, "raw");
  if (!fs.existsSync(rawDir)) return [];

  const sources: RawSourceMeta[] = [];
  const entries = fs.readdirSync(rawDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const relFilepath = toPosix(path.join("raw", entry.name));
    const fullPath = path.join(wikiDir, relFilepath);

    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const parsed = matter(raw);
      sources.push({
        id: path.basename(entry.name, ".md"),
        filepath: relFilepath,
        ...(parsed.data as Record<string, unknown>),
      });
    } catch {
      // skip unreadable / unparseable files
    }
  }

  return sources;
}

/**
 * Save a raw PDF source document to `raw/pdfs/{filename}`. Raw PDFs are
 * immutable once written — callers should never re-save or mutate them.
 * Returns the relative posix-style filepath.
 */
export function savePDFSource(
  wikiDir: string,
  filename: string,
  buffer: Buffer
): string {
  const pdfDir = path.join(wikiDir, "raw", "pdfs");
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const relFilepath = toPosix(path.join("raw", "pdfs", filename));
  fs.writeFileSync(path.join(wikiDir, relFilepath), buffer);
  return relFilepath;
}

/**
 * List all raw PDF sources under `raw/pdfs/`.
 * Filters to `.pdf` extension (case-insensitive) and returns posix filepaths.
 */
export function listPDFSources(
  wikiDir: string
): Array<{ filename: string; filepath: string }> {
  const pdfDir = path.join(wikiDir, "raw", "pdfs");
  if (!fs.existsSync(pdfDir)) return [];

  const pdfs: Array<{ filename: string; filepath: string }> = [];
  const entries = fs.readdirSync(pdfDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".pdf")) continue;

    pdfs.push({
      filename: entry.name,
      filepath: toPosix(path.join("raw", "pdfs", entry.name)),
    });
  }

  return pdfs;
}

// ─── Token usage tracking ──────────────────────────────────────────────

export type TokenOperation = "compile" | "ingest" | "query" | "lint";

export interface TokenEvent {
  operation: TokenOperation;
  input_tokens: number;
  output_tokens: number;
  timestamp: string;
}

interface OperationBreakdown {
  input: number;
  output: number;
  count: number;
}

export interface TokenSummary {
  total_input: number;
  total_output: number;
  total_tokens: number;
  by_operation: Record<TokenOperation, OperationBreakdown>;
  estimated_cost_usd: number;
  estimated_tokens_without_wiki: number;
  tokens_saved: number;
  model: string;
  provider: string;
}

/** Per-million-token pricing for common models, in USD. */
interface ModelPricing {
  input: number;
  output: number;
}

const MODEL_PRICING: Array<{ match: RegExp; pricing: ModelPricing }> = [
  { match: /haiku/i, pricing: { input: 0.25, output: 1.25 } },
  { match: /opus/i, pricing: { input: 15, output: 75 } },
  { match: /sonnet/i, pricing: { input: 3, output: 15 } },
  { match: /gpt-4o-mini/i, pricing: { input: 0.15, output: 0.6 } },
  { match: /gpt-4o/i, pricing: { input: 2.5, output: 10 } },
];

const DEFAULT_PRICING: ModelPricing = { input: 3, output: 15 }; // Sonnet

function pricingForModel(model: string): ModelPricing {
  for (const { match, pricing } of MODEL_PRICING) {
    if (match.test(model)) return pricing;
  }
  return DEFAULT_PRICING;
}

function detectModel(): { provider: string; model: string } {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o",
    };
  }
  return { provider: "unknown", model: "unknown" };
}

function tokensPath(wikiDir: string): string {
  return path.join(wikiDir, "tokens.json");
}

/**
 * Append a token usage event to `tokens.json`. Creates the file if missing.
 */
export function appendTokenUsage(
  wikiDir: string,
  operation: TokenOperation,
  usage: { input_tokens: number; output_tokens: number }
): void {
  const filePath = tokensPath(wikiDir);
  let events: TokenEvent[] = [];

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) events = parsed;
    } catch {
      // start fresh on corrupt file
      events = [];
    }
  }

  events.push({
    operation,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    timestamp: new Date().toISOString(),
  });

  fs.writeFileSync(filePath, JSON.stringify(events, null, 2), "utf-8");
}

/**
 * Read raw token events for a brain. Returns [] if no log exists yet.
 */
export function getTokenUsage(wikiDir: string): TokenEvent[] {
  const filePath = tokensPath(wikiDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Sum total characters across all raw source files under `raw/`.
 * Used to estimate the "without wiki" baseline cost.
 */
function sumRawSourceChars(wikiDir: string): number {
  const rawDir = path.join(wikiDir, "raw");
  if (!fs.existsSync(rawDir)) return 0;

  let total = 0;
  const entries = fs.readdirSync(rawDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    try {
      const content = fs.readFileSync(path.join(rawDir, entry.name), "utf-8");
      total += content.length;
    } catch {
      // skip unreadable files
    }
  }
  return total;
}

/**
 * Aggregate token stats across all logged events for a brain. Includes
 * a rough estimate of what a naive RAG-over-raw-sources approach would
 * have cost for the same number of queries.
 */
export function getTokenSummary(wikiDir: string): TokenSummary {
  const events = getTokenUsage(wikiDir);

  const by_operation: Record<TokenOperation, OperationBreakdown> = {
    compile: { input: 0, output: 0, count: 0 },
    ingest: { input: 0, output: 0, count: 0 },
    query: { input: 0, output: 0, count: 0 },
    lint: { input: 0, output: 0, count: 0 },
  };

  let total_input = 0;
  let total_output = 0;
  let queryCount = 0;

  for (const e of events) {
    const op = by_operation[e.operation];
    if (!op) continue;
    op.input += e.input_tokens;
    op.output += e.output_tokens;
    op.count += 1;
    total_input += e.input_tokens;
    total_output += e.output_tokens;
    if (e.operation === "query") queryCount += 1;
  }

  const total_tokens = total_input + total_output;

  const { provider, model } = detectModel();
  const pricing = pricingForModel(model);
  const estimated_cost_usd =
    (total_input / 1_000_000) * pricing.input +
    (total_output / 1_000_000) * pricing.output;

  // Without-wiki baseline: every query would ship all raw sources as context.
  const rawChars = sumRawSourceChars(wikiDir);
  const rawTokens = Math.round(rawChars / 4);
  const estimated_tokens_without_wiki = rawTokens * queryCount;
  const tokens_saved = Math.max(
    0,
    estimated_tokens_without_wiki - total_tokens
  );

  return {
    total_input,
    total_output,
    total_tokens,
    by_operation,
    estimated_cost_usd,
    estimated_tokens_without_wiki,
    tokens_saved,
    model,
    provider,
  };
}

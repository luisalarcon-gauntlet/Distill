/**
 * Wiki Filesystem Layer
 * Reads and writes the wiki as real .md files on disk.
 * Uses gray-matter for frontmatter parsing/serialization.
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

export interface WikiPage {
  id: string;
  title: string;
  type: "overview" | "concept" | "entity" | "source" | "analysis";
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

const TYPE_DIRS: Record<string, string> = {
  overview: "wiki",
  concept: "wiki/concepts",
  entity: "wiki/entities",
  source: "wiki/sources",
  analysis: "wiki/analyses",
};

const SCHEMA_CONTENT = `# Wiki Schema

## Page Types
- **overview**: High-level summary of the entire topic
- **concept**: A key idea, technique, or theory
- **entity**: A person, organization, dataset, or tool
- **source**: Summary of a specific paper or resource
- **analysis**: Cross-cutting analysis or comparison

## Conventions
- Page IDs use kebab-case (e.g., "attention-mechanism")
- Cross-references use [[Wiki Link]] syntax matching page titles
- Each page has YAML frontmatter with: title, type, sources, links, created, updated
- Content should be substantive (3-6 paragraphs per page)
`;

/**
 * Initialize a new wiki directory structure.
 */
export function initWikiDir(wikiDir: string, topic: string): void {
  const dirs = [
    "",
    "raw",
    "wiki",
    "wiki/concepts",
    "wiki/entities",
    "wiki/sources",
    "wiki/analyses",
    "exports",
  ];

  for (const dir of dirs) {
    const full = path.join(wikiDir, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
  }

  // Write SCHEMA.md
  fs.writeFileSync(path.join(wikiDir, "SCHEMA.md"), SCHEMA_CONTENT, "utf-8");

  // Write initial index.md
  const indexContent = `---
title: Index
topic: ${topic}
generated: ${new Date().toISOString().split("T")[0]}
---

# ${topic} — Wiki Index

_No pages yet. Run a compile or ingest operation to populate._
`;
  fs.writeFileSync(path.join(wikiDir, "index.md"), indexContent, "utf-8");

  // Write initial log.md
  const logContent = `# Operations Log

## [${new Date().toISOString()}] init | Created wiki for "${topic}"
`;
  fs.writeFileSync(path.join(wikiDir, "log.md"), logContent, "utf-8");
}

/**
 * Write a page to disk as a markdown file with frontmatter.
 * Returns the relative filepath.
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
  }
): string {
  const typeDir = TYPE_DIRS[page.type] || "wiki";
  const dir = path.join(wikiDir, typeDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const now = new Date().toISOString().split("T")[0];
  const filepath = path.join(typeDir, `${page.id}.md`);
  const fullPath = path.join(wikiDir, filepath);

  // Preserve created date if file already exists
  let created = now;
  if (fs.existsSync(fullPath)) {
    try {
      const existing = matter(fs.readFileSync(fullPath, "utf-8"));
      created = existing.data.created || now;
    } catch {
      // ignore parse errors
    }
  }

  const frontmatter = {
    title: page.title,
    type: page.type,
    sources: page.sources || [],
    links: page.links || [],
    created,
    updated: now,
  };

  const fileContent = matter.stringify(page.content, frontmatter);
  fs.writeFileSync(fullPath, fileContent, "utf-8");

  return filepath;
}

/**
 * Read a single page by its relative filepath.
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
      type: parsed.data.type || "concept",
      content: parsed.content.trim(),
      links: parsed.data.links || [],
      sources: parsed.data.sources || [],
      filepath,
      created: parsed.data.created || "",
      updated: parsed.data.updated || "",
    };
  } catch {
    return null;
  }
}

/**
 * Recursively read all .md files under wiki/ and return as WikiPage[].
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
        const relative = path.relative(wikiDir, full).replace(/\\/g, "/");
        const page = readPage(wikiDir, relative);
        if (page) pages.push(page);
      }
    }
  }

  walk(wikiPath);
  return pages;
}

/**
 * Rebuild index.md from all current pages.
 */
export function rebuildIndex(wikiDir: string, topic: string): void {
  const pages = readAllPages(wikiDir);

  const grouped: Record<string, WikiPage[]> = {};
  for (const page of pages) {
    if (!grouped[page.type]) grouped[page.type] = [];
    grouped[page.type].push(page);
  }

  const typeOrder = ["overview", "concept", "entity", "source", "analysis"];
  let content = "";

  for (const type of typeOrder) {
    const group = grouped[type];
    if (!group || group.length === 0) continue;
    content += `\n## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
    for (const page of group.sort((a, b) => a.title.localeCompare(b.title))) {
      content += `- [[${page.title}]] — \`${page.filepath}\`\n`;
    }
  }

  const frontmatter = {
    title: "Index",
    topic,
    pages: pages.length,
    generated: new Date().toISOString().split("T")[0],
  };

  const fileContent = matter.stringify(
    `\n# ${topic} — Wiki Index\n\n${pages.length} pages\n${content}`,
    frontmatter
  );

  fs.writeFileSync(path.join(wikiDir, "index.md"), fileContent, "utf-8");
}

/**
 * Append an entry to log.md.
 */
export function appendLog(
  wikiDir: string,
  action: string,
  detail: string
): void {
  const logPath = path.join(wikiDir, "log.md");
  const entry = `\n## [${new Date().toISOString()}] ${action} | ${detail}\n`;

  if (fs.existsSync(logPath)) {
    fs.appendFileSync(logPath, entry, "utf-8");
  } else {
    fs.writeFileSync(logPath, `# Operations Log\n${entry}`, "utf-8");
  }
}

/**
 * Parse log.md into structured entries.
 */
export function readLog(wikiDir: string): LogEntry[] {
  const logPath = path.join(wikiDir, "log.md");
  if (!fs.existsSync(logPath)) return [];

  const raw = fs.readFileSync(logPath, "utf-8");
  const entries: LogEntry[] = [];

  const regex = /## \[(.+?)\] (.+?) \| (.+)/g;
  let match;
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
 * Save a raw source document to raw/.
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

  const filepath = path.join("raw", `${id}.md`);
  fs.writeFileSync(path.join(wikiDir, filepath), content, "utf-8");
  return filepath;
}

/**
 * Academic paper search across three backends:
 *   - Semantic Scholar (free, no auth, JSON)
 *   - arXiv (free, no auth, Atom XML)
 *   - OpenAlex (free, polite email, JSON with inverted-index abstracts)
 *
 * All backends are normalized to the shared `Paper` interface. The entry
 * point for callers is `searchAllSources` — it fans out in parallel,
 * deduplicates near-identical results, and sorts by citation count.
 */

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  citationCount: number;
  source_api: "semantic_scholar" | "arxiv" | "openalex";
  arxivId?: string;
}

const S2_BASE = "https://api.semanticscholar.org/graph/v1";
const ARXIV_BASE = "https://export.arxiv.org/api/query";
const OPENALEX_BASE = "https://api.openalex.org/works";
const POLITE_UA = "Distill/0.1 (mailto:distill@example.com)";

// ─── Formatting helpers ───────────────────────────────────────────

/**
 * Sanitize a paper ID for use as a filename. Strips everything that
 * isn't alphanumeric, dash, or colon, then replaces colons with dashes.
 */
export function paperRawId(paper: Paper): string {
  return paper.id.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * Serialize a paper as a raw-source markdown file with YAML frontmatter.
 * This is what gets written under `raw/{id}.md` — the immutable
 * representation of the source before the LLM touches it.
 */
export function paperToRawMarkdown(paper: Paper): string {
  const today = new Date().toISOString().split("T")[0];
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(paper.title)}`,
    `authors: ${JSON.stringify(paper.authors)}`,
    `year: ${paper.year ?? "null"}`,
    `citations: ${paper.citationCount}`,
    `url: ${JSON.stringify(paper.url)}`,
    `source_api: ${paper.source_api}`,
    `paper_id: ${JSON.stringify(paper.id)}`,
    ...(paper.arxivId ? [`arxiv_id: ${JSON.stringify(paper.arxivId)}`] : []),
    `ingested: ${today}`,
    "---",
    "",
  ].join("\n");

  const body = [
    `# ${paper.title}`,
    "",
    `**Authors:** ${paper.authors.join(", ") || "Unknown"}`,
    `**Year:** ${paper.year ?? "n.d."}`,
    `**Citations:** ${paper.citationCount}`,
    `**Source:** ${paper.source_api}`,
    `**URL:** ${paper.url}`,
    "",
    "## Abstract",
    "",
    paper.abstract || "No abstract available.",
  ].join("\n");

  return frontmatter + body + "\n";
}

// ─── Semantic Scholar ──────────────────────────────────────────────

export async function searchPapers(query: string, limit: number = 10): Promise<Paper[]> {
  const url = `${S2_BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,authors,year,citationCount,url,externalIds`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Distill/0.1 (research-wiki-tool)" },
    });

    if (!res.ok) {
      console.error(`Semantic Scholar error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.data || []).map((p: any) => ({
      id: p.paperId,
      title: p.title || "Untitled",
      authors: (p.authors || []).map((a: any) => a.name),
      year: p.year,
      abstract: p.abstract || "",
      url: p.url || "",
      citationCount: p.citationCount || 0,
      source_api: "semantic_scholar" as const,
      arxivId: p.externalIds?.ArXiv,
    }));
  } catch (err) {
    console.error("Semantic Scholar fetch failed:", err);
    return [];
  }
}

export async function getPaperByArxivId(arxivId: string): Promise<Paper | null> {
  const url = `${S2_BASE}/paper/ARXIV:${arxivId}?fields=title,abstract,authors,year,citationCount,url`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const p = await res.json();
    return {
      id: p.paperId,
      title: p.title || "Untitled",
      authors: (p.authors || []).map((a: any) => a.name),
      year: p.year,
      abstract: p.abstract || "",
      url: p.url || "",
      citationCount: p.citationCount || 0,
      source_api: "semantic_scholar",
      arxivId,
    };
  } catch (err) {
    console.error("Semantic Scholar arxiv lookup failed:", err);
    return null;
  }
}

/**
 * Fetch related/recommended papers for a given paper ID.
 */
export async function getRelatedPapers(paperId: string, limit: number = 5): Promise<Paper[]> {
  const url = `${S2_BASE}/paper/${paperId}/recommendations?limit=${limit}&fields=title,abstract,authors,year,citationCount,url`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    return (data.recommendedPapers || []).map((p: any) => ({
      id: p.paperId,
      title: p.title || "Untitled",
      authors: (p.authors || []).map((a: any) => a.name),
      year: p.year,
      abstract: p.abstract || "",
      url: p.url || "",
      citationCount: p.citationCount || 0,
      source_api: "semantic_scholar" as const,
    }));
  } catch (err) {
    console.error("Semantic Scholar related-papers fetch failed:", err);
    return [];
  }
}

// ─── arXiv ─────────────────────────────────────────────────────────

/**
 * Minimal Atom XML extractor. arXiv responses are well-formed so we can
 * get away with regex — a real XML parser would be overkill for a single
 * known schema, and we don't want to pull in a dependency.
 */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function extractOne(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchArxiv(query: string, limit: number = 10): Promise<Paper[]> {
  // Split query into individual terms and AND them together so arXiv treats
  // "destructive sound waves" as all:destructive AND all:sound AND all:waves,
  // not as an implicit OR across all three words.
  const arxivQuery = query
    .trim()
    .split(/\s+/)
    .map((term) => `all:${term}`)
    .join("+AND+");
  const url = `${ARXIV_BASE}?search_query=${arxivQuery}&max_results=${limit}&sortBy=relevance`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": POLITE_UA },
    });

    if (!res.ok) {
      console.error(`arXiv error: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const entries = extractAll(xml, "entry");

    return entries.map((entry): Paper => {
      const idUrl = decodeEntities(extractOne(entry, "id"));
      // idUrl looks like http://arxiv.org/abs/2401.12345v2 — strip version
      const arxivId = idUrl
        .replace(/^https?:\/\/arxiv\.org\/abs\//, "")
        .replace(/v\d+$/, "");

      const title = decodeEntities(extractOne(entry, "title"));
      const summary = decodeEntities(extractOne(entry, "summary"));
      const published = extractOne(entry, "published");
      const yearMatch = published.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

      const authorBlocks = extractAll(entry, "author");
      const authors = authorBlocks
        .map((block) => decodeEntities(extractOne(block, "name")))
        .filter(Boolean);

      return {
        id: `arxiv:${arxivId}`,
        title: title || "Untitled",
        authors,
        year,
        abstract: summary,
        url: idUrl || `https://arxiv.org/abs/${arxivId}`,
        citationCount: 0, // arXiv doesn't provide citation counts
        source_api: "arxiv",
        arxivId,
      };
    });
  } catch (err) {
    console.error("arXiv fetch failed:", err);
    return [];
  }
}

// ─── OpenAlex ──────────────────────────────────────────────────────

/**
 * OpenAlex stores abstracts as an inverted index:
 *   { "word": [pos1, pos2, ...], "another": [pos3], ... }
 * Reconstruct the original text by placing each word at its positions
 * and joining in order.
 */
function reconstructOpenAlexAbstract(
  inverted: Record<string, number[]> | null | undefined
): string {
  if (!inverted) return "";
  const positioned: Array<{ pos: number; word: string }> = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) positioned.push({ pos, word });
  }
  positioned.sort((a, b) => a.pos - b.pos);
  return positioned.map((p) => p.word).join(" ");
}

export async function searchOpenAlex(query: string, limit: number = 10): Promise<Paper[]> {
  const url = `${OPENALEX_BASE}?search=${encodeURIComponent(query)}&per_page=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": POLITE_UA },
    });

    if (!res.ok) {
      console.error(`OpenAlex error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.results || []).map((r: any): Paper => {
      const authors = (r.authorships || [])
        .map((a: any) => a?.author?.display_name)
        .filter(Boolean);

      const abstract = reconstructOpenAlexAbstract(r.abstract_inverted_index);
      const url = r.doi || r.id || "";
      const idStr =
        typeof r.id === "string" ? r.id.replace(/^https?:\/\/openalex\.org\//, "") : "";

      return {
        id: idStr ? `openalex:${idStr}` : `openalex:${Math.random().toString(36).slice(2)}`,
        title: r.title || r.display_name || "Untitled",
        authors,
        year: r.publication_year ?? null,
        abstract,
        url,
        citationCount: r.cited_by_count || 0,
        source_api: "openalex",
      };
    });
  } catch (err) {
    console.error("OpenAlex fetch failed:", err);
    return [];
  }
}

// ─── Combined search with dedup ────────────────────────────────────

/**
 * Normalize a title for fuzzy matching: lowercase, strip punctuation,
 * collapse whitespace, trim.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Word-overlap similarity: |A ∩ B| / max(|A|, |B|), ignoring stopwords
 * of length < 3. Returns [0, 1].
 */
function titleWordOverlap(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(" ").filter((w) => w.length >= 3));
  const wordsB = new Set(normalizeTitle(b).split(" ").filter((w) => w.length >= 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersect = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersect++;
  return intersect / Math.max(wordsA.size, wordsB.size);
}

/**
 * Score a paper for "richness" — when we collapse duplicates we keep
 * the one with more metadata.
 */
function metadataScore(p: Paper): number {
  return (p.abstract?.length || 0) + (p.citationCount || 0) * 10;
}

/**
 * Deduplicate papers across backends. Two papers are considered the
 * same if their titles share >80% word overlap AND they have the same
 * year (or one of them has a null year). We keep whichever has more
 * metadata and merge the arxivId if only one side has it.
 */
function deduplicate(papers: Paper[]): Paper[] {
  const kept: Paper[] = [];

  for (const candidate of papers) {
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];
      const sameYear =
        existing.year == null ||
        candidate.year == null ||
        existing.year === candidate.year;
      if (!sameYear) continue;
      if (titleWordOverlap(existing.title, candidate.title) >= 0.8) {
        const winner = metadataScore(candidate) > metadataScore(existing) ? candidate : existing;
        const loser = winner === candidate ? existing : candidate;
        // Merge arxivId if the winner lacks one but the loser has it.
        if (!winner.arxivId && loser.arxivId) winner.arxivId = loser.arxivId;
        kept[i] = winner;
        merged = true;
        break;
      }
    }
    if (!merged) kept.push(candidate);
  }

  return kept;
}

/**
 * Search all three backends in parallel, deduplicate, and return the
 * top `limit` results sorted by citation count desc.
 *
 * Returns an empty array (and logs) if all three fail.
 */
export async function searchAllSources(query: string, limit: number = 10): Promise<Paper[]> {
  // Ask each backend for `limit` so we have headroom after dedup.
  const results = await Promise.allSettled([
    searchPapers(query, limit),
    searchArxiv(query, limit),
    searchOpenAlex(query, limit),
  ]);

  const labels = ["Semantic Scholar", "arXiv", "OpenAlex"] as const;
  const collected: Paper[] = [];
  let anySucceeded = false;

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      anySucceeded = true;
      collected.push(...r.value);
    } else {
      console.error(`${labels[i]} search rejected:`, r.reason);
    }
  });

  if (!anySucceeded) {
    console.error(
      `All paper sources failed for query "${query}". Check network connectivity or upstream API status.`
    );
    return [];
  }

  const deduped = deduplicate(collected);

  // Drop papers with zero keyword overlap with the query.
  // Extract meaningful query keywords (length >= 3 to skip prepositions/articles).
  // We keep the threshold at >= 1 match so we only drop obvious non-matches,
  // not borderline results where the paper title uses synonyms.
  const queryKeywords = new Set(
    normalizeTitle(query)
      .split(" ")
      .filter((w) => w.length >= 3)
  );

  const relevant =
    queryKeywords.size === 0
      ? deduped // no filterable keywords — don't drop anything
      : deduped.filter((paper) => {
          const titleWords = normalizeTitle(paper.title).split(" ");
          return titleWords.some((w) => queryKeywords.has(w));
        });

  relevant.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
  return relevant.slice(0, limit);
}

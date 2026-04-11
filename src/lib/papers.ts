/**
 * Academic paper search via Semantic Scholar API (free, no auth).
 * Also supports arXiv ID lookup.
 */

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  citationCount: number;
  source: "semantic_scholar" | "arxiv";
}

const S2_BASE = "https://api.semanticscholar.org/graph/v1";

export async function searchPapers(query: string, limit: number = 10): Promise<Paper[]> {
  const url = `${S2_BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,authors,year,citationCount,url,externalIds`;

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
    source: "semantic_scholar" as const,
  }));
}

export async function getPaperByArxivId(arxivId: string): Promise<Paper | null> {
  const url = `${S2_BASE}/paper/ARXIV:${arxivId}?fields=title,abstract,authors,year,citationCount,url`;

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
    source: "semantic_scholar",
  };
}

/**
 * Fetch related/recommended papers for a given paper ID.
 */
export async function getRelatedPapers(paperId: string, limit: number = 5): Promise<Paper[]> {
  const url = `${S2_BASE}/paper/${paperId}/recommendations?limit=${limit}&fields=title,abstract,authors,year,citationCount,url`;

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
    source: "semantic_scholar" as const,
  }));
}

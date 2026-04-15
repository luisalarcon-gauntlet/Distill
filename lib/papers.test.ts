/**
 * Tests for lib/papers.ts
 *
 * Exported functions are tested directly.
 * Internal helpers (normalizeTitle, titleWordOverlap, metadataScore,
 * deduplicate, reconstructOpenAlexAbstract) are not exported, so they are
 * exercised indirectly through searchAllSources with a mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  paperRawId,
  paperToRawMarkdown,
  searchAllSources,
  type Paper,
} from "./papers";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: "test-paper-1",
    title: "Attention Is All You Need",
    authors: ["Vaswani, A.", "Shazeer, N."],
    year: 2017,
    abstract: "The dominant sequence transduction models are based on complex recurrent networks.",
    url: "https://arxiv.org/abs/1706.03762",
    citationCount: 50000,
    source_api: "semantic_scholar",
    ...overrides,
  };
}

// ─── paperRawId ──────────────────────────────────────────────────────────────

describe("paperRawId", () => {
  it("returns the id when it contains only alphanumeric characters and dashes", () => {
    const paper = makePaper({ id: "abc-123" });
    expect(paperRawId(paper)).toBe("abc-123");
  });

  it("replaces dots with dashes", () => {
    const paper = makePaper({ id: "arxiv:1706.03762" });
    // colon and dot are not in [a-zA-Z0-9-], both become dashes
    expect(paperRawId(paper)).toBe("arxiv-1706-03762");
  });

  it("replaces colons with dashes", () => {
    const paper = makePaper({ id: "openalex:W123" });
    expect(paperRawId(paper)).toBe("openalex-W123");
  });

  it("replaces spaces with dashes", () => {
    const paper = makePaper({ id: "some paper id" });
    expect(paperRawId(paper)).toBe("some-paper-id");
  });

  it("replaces slashes with dashes", () => {
    const paper = makePaper({ id: "folder/file" });
    expect(paperRawId(paper)).toBe("folder-file");
  });

  it("handles an id that is already clean", () => {
    const paper = makePaper({ id: "CleanId-007" });
    expect(paperRawId(paper)).toBe("CleanId-007");
  });

  it("handles an empty string id", () => {
    const paper = makePaper({ id: "" });
    expect(paperRawId(paper)).toBe("");
  });

  it("strips every special character from a complex openalex-style id", () => {
    const paper = makePaper({ id: "openalex:W2741809807" });
    expect(paperRawId(paper)).toBe("openalex-W2741809807");
  });
});

// ─── paperToRawMarkdown ──────────────────────────────────────────────────────

describe("paperToRawMarkdown", () => {
  it("produces output that starts with ---", () => {
    const md = paperToRawMarkdown(makePaper());
    expect(md.startsWith("---\n")).toBe(true);
  });

  it("includes all required YAML frontmatter fields", () => {
    const paper = makePaper();
    const md = paperToRawMarkdown(paper);
    expect(md).toContain('title: "Attention Is All You Need"');
    expect(md).toContain(`citations: ${paper.citationCount}`);
    expect(md).toContain(`year: ${paper.year}`);
    expect(md).toContain(`source_api: ${paper.source_api}`);
    expect(md).toContain(`paper_id: ${JSON.stringify(paper.id)}`);
  });

  it("includes the authors array in YAML as JSON", () => {
    const paper = makePaper({ authors: ["Alice", "Bob"] });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain('authors: ["Alice","Bob"]');
  });

  it("includes the arxiv_id line when arxivId is present", () => {
    const paper = makePaper({ arxivId: "1706.03762" });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain('arxiv_id: "1706.03762"');
  });

  it("omits the arxiv_id line when arxivId is absent", () => {
    const paper = makePaper({ arxivId: undefined });
    const md = paperToRawMarkdown(paper);
    expect(md).not.toContain("arxiv_id:");
  });

  it("uses null string for year when year is null", () => {
    const paper = makePaper({ year: null });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain("year: null");
  });

  it("includes ingested date matching today's ISO date", () => {
    const today = new Date().toISOString().split("T")[0];
    const md = paperToRawMarkdown(makePaper());
    expect(md).toContain(`ingested: ${today}`);
  });

  it("includes a markdown body with the paper title as H1", () => {
    const paper = makePaper({ title: "My Cool Paper" });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain("# My Cool Paper");
  });

  it("includes the abstract in the body", () => {
    const paper = makePaper({ abstract: "This paper shows X." });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain("This paper shows X.");
  });

  it('falls back to "No abstract available." when abstract is empty', () => {
    const paper = makePaper({ abstract: "" });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain("No abstract available.");
  });

  it('falls back to "Unknown" for authors when author list is empty', () => {
    const paper = makePaper({ authors: [] });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain("**Authors:** Unknown");
  });

  it("uses n.d. for year in the body when year is null", () => {
    const paper = makePaper({ year: null });
    const md = paperToRawMarkdown(paper);
    expect(md).toContain("**Year:** n.d.");
  });

  it("closes the frontmatter with a second --- line", () => {
    const md = paperToRawMarkdown(makePaper());
    // The frontmatter block ends with "---\n\n# Title"
    const lines = md.split("\n");
    // First line is "---", find the closing "---"
    const closingIndex = lines.indexOf("---", 1);
    expect(closingIndex).toBeGreaterThan(1);
  });

  it("ends with a trailing newline", () => {
    const md = paperToRawMarkdown(makePaper());
    expect(md.endsWith("\n")).toBe(true);
  });

  it("includes the URL in both frontmatter and body", () => {
    const paper = makePaper({ url: "https://example.com/paper" });
    const md = paperToRawMarkdown(paper);
    // frontmatter
    expect(md).toContain('url: "https://example.com/paper"');
    // body
    expect(md).toContain("**URL:** https://example.com/paper");
  });

  it("handles a title that contains double quotes (JSON-encodes it)", () => {
    const paper = makePaper({ title: 'Learning "Deep" Representations' });
    const md = paperToRawMarkdown(paper);
    // JSON.stringify will escape the inner quotes
    expect(md).toContain('title: "Learning \\"Deep\\" Representations"');
  });
});

// ─── Internal helpers tested via searchAllSources ────────────────────────────
//
// normalizeTitle, titleWordOverlap, metadataScore, deduplicate, and
// reconstructOpenAlexAbstract are all private. We exercise them by feeding
// controlled responses through a mocked global fetch so that searchAllSources
// runs the full pipeline: collect → deduplicate → filter → sort.

/**
 * Build a minimal Semantic Scholar API response body for a list of papers.
 */
function s2Response(papers: Array<{ paperId: string; title: string; year?: number | null; abstract?: string; citationCount?: number; arxivId?: string }>): string {
  const data = papers.map((p) => ({
    paperId: p.paperId,
    title: p.title,
    authors: [],
    year: p.year ?? null,
    abstract: p.abstract ?? "",
    url: "",
    citationCount: p.citationCount ?? 0,
    externalIds: p.arxivId ? { ArXiv: p.arxivId } : {},
  }));
  return JSON.stringify({ data });
}

/**
 * Build a minimal OpenAlex API response body.
 * abstract_inverted_index maps words to position arrays.
 */
function openAlexResponse(papers: Array<{ id: string; title: string; year?: number | null; abstract_inverted_index?: Record<string, number[]>; cited_by_count?: number }>): string {
  const results = papers.map((p) => ({
    id: `https://openalex.org/${p.id}`,
    title: p.title,
    display_name: p.title,
    publication_year: p.year ?? null,
    abstract_inverted_index: p.abstract_inverted_index ?? null,
    cited_by_count: p.cited_by_count ?? 0,
    authorships: [],
    doi: null,
  }));
  return JSON.stringify({ results });
}

/**
 * Build a minimal arXiv Atom XML response for a list of entries.
 */
function arxivResponse(entries: Array<{ id: string; title: string; year?: number; abstract?: string; authors?: string[] }>): string {
  const entryXml = entries
    .map((e) => {
      const authorTags = (e.authors ?? [])
        .map((name) => `<author><name>${name}</name></author>`)
        .join("");
      return `<entry>
        <id>http://arxiv.org/abs/${e.id}v1</id>
        <title>${e.title}</title>
        <summary>${e.abstract ?? ""}</summary>
        <published>${e.year ?? 2020}-01-01T00:00:00Z</published>
        ${authorTags}
      </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
${entryXml}
</feed>`;
}

/**
 * Wire up global fetch to return the given three responses
 * (S2, arXiv, OpenAlex) in the order that searchAllSources calls them.
 * searchAllSources uses Promise.allSettled([searchPapers, searchArxiv, searchOpenAlex]).
 * The requests go out in that order but may be interleaved; we use URL matching.
 */
function mockFetch(
  s2Body: string,
  arxivBody: string,
  openAlexBody: string
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const urlStr = String(url);
      let body: string;
      let contentType = "application/json";

      if (urlStr.includes("semanticscholar.org")) {
        body = s2Body;
      } else if (urlStr.includes("arxiv.org")) {
        body = arxivBody;
        contentType = "application/atom+xml";
      } else if (urlStr.includes("openalex.org")) {
        body = openAlexBody;
      } else {
        body = JSON.stringify({ data: [], results: [] });
      }

      return new Response(body, {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    })
  );
}

/** Helper that returns empty responses from all three backends. */
function mockAllEmpty(): void {
  mockFetch(
    JSON.stringify({ data: [] }),
    arxivResponse([]),
    JSON.stringify({ results: [] })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── normalizeTitle (indirect) ───────────────────────────────────────────────

describe("normalizeTitle (via searchAllSources dedup + filter)", () => {
  it("is case-insensitive: 'Attention' and 'attention' are treated the same word", async () => {
    // Put the same paper with different cases from S2 and OpenAlex.
    // After dedup they should collapse to one result.
    mockFetch(
      s2Response([
        { paperId: "s2-1", title: "Attention Is All You Need", year: 2017, citationCount: 1000 },
      ]),
      arxivResponse([]),
      openAlexResponse([
        { id: "W1", title: "attention is all you need", year: 2017, cited_by_count: 800 },
      ])
    );

    const results = await searchAllSources("attention");
    expect(results.length).toBe(1);
  });

  it("strips punctuation so 'BERT: Pre-training' matches 'BERT Pre training'", async () => {
    mockFetch(
      s2Response([
        { paperId: "s2-bert", title: "BERT: Pre-training of Deep Bidirectional Transformers", year: 2019, citationCount: 5000 },
      ]),
      arxivResponse([]),
      openAlexResponse([
        { id: "W2", title: "BERT Pre-training of Deep Bidirectional Transformers", year: 2019, cited_by_count: 4000 },
      ])
    );

    const results = await searchAllSources("bert");
    expect(results.length).toBe(1);
    // Should keep the higher-metadata winner
    expect(results[0].citationCount).toBe(5000);
  });
});

// ─── titleWordOverlap (indirect) ─────────────────────────────────────────────

describe("titleWordOverlap (via dedup threshold in searchAllSources)", () => {
  it("does NOT deduplicate papers with < 80% word overlap", async () => {
    // "Neural Machine Translation" vs "Sequence to Sequence Learning" share 0 words
    mockFetch(
      s2Response([
        { paperId: "s2-nmt", title: "Neural Machine Translation by Jointly Learning to Align", year: 2015, citationCount: 100 },
      ]),
      arxivResponse([]),
      openAlexResponse([
        { id: "W3", title: "Sequence to Sequence Learning with Neural Networks", year: 2015, cited_by_count: 200 },
      ])
    );

    const results = await searchAllSources("neural");
    expect(results.length).toBe(2);
  });

  it("deduplicates papers that share > 80% word overlap", async () => {
    // Exact same title from two backends — 100% overlap
    const title = "Deep Residual Learning for Image Recognition";
    mockFetch(
      s2Response([{ paperId: "s2-resnet", title, year: 2016, citationCount: 50000 }]),
      arxivResponse([{ id: "1512.03385", title, year: 2016 }]),
      openAlexResponse([])
    );

    const results = await searchAllSources("deep residual");
    expect(results.length).toBe(1);
    expect(results[0].title).toBe(title);
  });

  it("ignores words shorter than 3 characters when computing overlap", async () => {
    // Two titles that are identical except for short words — should still dedup
    mockFetch(
      s2Response([{ paperId: "s2-a", title: "On the Effectiveness of Transformers", year: 2022, citationCount: 100 }]),
      arxivResponse([]),
      openAlexResponse([{ id: "W4", title: "On Effectiveness of the Transformers", year: 2022, cited_by_count: 90 }])
    );

    // Both have the meaningful words: effectiveness, transformers
    // Short words "On", "the", "of" (len < 3 after normalize: "on"=2, "the"=3, "of"=2)
    // "the" has length 3 so it passes the >= 3 filter
    // Meaningful shared: effectiveness, transformers, the → high overlap → dedup
    const results = await searchAllSources("transformers");
    expect(results.length).toBe(1);
  });
});

// ─── metadataScore (indirect) ────────────────────────────────────────────────

describe("metadataScore (via dedup winner selection in searchAllSources)", () => {
  it("keeps the paper with higher citation count when abstracts are equal length", async () => {
    const title = "Generative Adversarial Networks";
    mockFetch(
      s2Response([
        { paperId: "s2-gan-low", title, year: 2014, abstract: "Short abstract here.", citationCount: 100 },
      ]),
      arxivResponse([]),
      openAlexResponse([
        { id: "W5", title, year: 2014, abstract_inverted_index: { Short: [0], abstract: [1], here: [2] }, cited_by_count: 999 },
      ])
    );

    const results = await searchAllSources("generative adversarial");
    expect(results.length).toBe(1);
    expect(results[0].citationCount).toBe(999);
  });

  it("keeps the paper with a longer abstract when citation counts are equal", async () => {
    const title = "Variational Autoencoders for Latent Representation Learning";
    const shortAbstract = "Brief.";
    const longAbstract = "This paper introduces variational autoencoders and demonstrates their effectiveness across multiple benchmark datasets for learning latent representations.";

    mockFetch(
      s2Response([
        { paperId: "s2-vae", title, year: 2020, abstract: shortAbstract, citationCount: 50 },
      ]),
      arxivResponse([]),
      openAlexResponse([
        {
          id: "W6", title, year: 2020, cited_by_count: 50,
          // Build inverted index from longAbstract
          abstract_inverted_index: longAbstract.split(" ").reduce<Record<string, number[]>>((acc, word, i) => {
            acc[word] = [...(acc[word] ?? []), i];
            return acc;
          }, {}),
        },
      ])
    );

    const results = await searchAllSources("variational autoencoders");
    expect(results.length).toBe(1);
    // The winner should have the longer abstract
    expect(results[0].abstract.length).toBeGreaterThan(shortAbstract.length);
  });
});

// ─── deduplicate (indirect) ──────────────────────────────────────────────────

describe("deduplicate (via searchAllSources)", () => {
  it("keeps distinct papers from different backends as separate results", async () => {
    mockFetch(
      s2Response([{ paperId: "s2-x", title: "Graph Neural Networks Survey", year: 2020, citationCount: 300 }]),
      arxivResponse([{ id: "2004.00544", title: "Convolutional Neural Networks for Vision", year: 2020 }]),
      openAlexResponse([{ id: "W7", title: "Recurrent Neural Networks for Sequence Modeling", year: 2015, cited_by_count: 150 }])
    );

    const results = await searchAllSources("neural");
    expect(results.length).toBe(3);
  });

  it("merges arxivId from the loser paper into the winner", async () => {
    const title = "Dropout Regularization for Deep Neural Networks";
    // S2 has high citations but no arxivId; arXiv naturally has an arxivId
    mockFetch(
      s2Response([
        { paperId: "s2-dropout", title, year: 2014, citationCount: 8000, arxivId: undefined },
      ]),
      arxivResponse([
        { id: "1207.0580", title, year: 2014, abstract: "We present dropout." },
      ]),
      openAlexResponse([])
    );

    const results = await searchAllSources("dropout neural");
    expect(results.length).toBe(1);
    expect(results[0].arxivId).toBe("1207.0580");
  });

  it("merges papers when one has null year and titles overlap > 80%", async () => {
    const title = "Transformer Architecture for Natural Language Processing";
    mockFetch(
      s2Response([{ paperId: "s2-t", title, year: 2020, citationCount: 500 }]),
      arxivResponse([]),
      openAlexResponse([{ id: "W8", title, year: null, cited_by_count: 400 }]) // null year
    );

    const results = await searchAllSources("transformer natural language");
    expect(results.length).toBe(1);
  });

  it("does NOT merge papers with same title but different concrete years", async () => {
    const title = "Survey of Machine Learning Methods in Healthcare";
    mockFetch(
      s2Response([{ paperId: "s2-ml", title, year: 2018, citationCount: 100 }]),
      arxivResponse([]),
      openAlexResponse([{ id: "W9", title, year: 2021, cited_by_count: 80 }])
    );

    const results = await searchAllSources("machine learning healthcare");
    expect(results.length).toBe(2);
  });

  it("handles an empty input list and returns an empty array", async () => {
    mockAllEmpty();
    const results = await searchAllSources("anything");
    expect(results).toEqual([]);
  });

  it("returns a single paper unchanged when there is only one paper", async () => {
    mockFetch(
      s2Response([{ paperId: "s2-only", title: "Federated Learning Survey", year: 2021, citationCount: 50 }]),
      arxivResponse([]),
      openAlexResponse([])
    );

    const results = await searchAllSources("federated learning");
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Federated Learning Survey");
  });
});

// ─── paperRawId edge cases (extended) ────────────────────────────────────────

describe("paperRawId edge cases", () => {
  it("preserves uppercase letters", () => {
    expect(paperRawId(makePaper({ id: "ArXiv-1234" }))).toBe("ArXiv-1234");
  });

  it("converts unicode characters to dashes", () => {
    // Non-ASCII characters are outside [a-zA-Z0-9-]
    expect(paperRawId(makePaper({ id: "café-paper" }))).toBe("caf--paper");
  });

  it("handles an id with only special characters", () => {
    // All replaced by dashes
    const result = paperRawId(makePaper({ id: "::::" }));
    expect(result).toBe("----");
  });

  it("handles a very long id without truncating", () => {
    const longId = "a".repeat(200) + "-" + "b".repeat(200);
    const result = paperRawId(makePaper({ id: longId }));
    expect(result.length).toBe(401);
  });
});

// ─── reconstructOpenAlexAbstract (indirect via searchAllSources) ──────────────

describe("reconstructOpenAlexAbstract (via OpenAlex backend in searchAllSources)", () => {
  it("reconstructs a simple abstract from an inverted index", async () => {
    // "The cat sat" → { The: [0], cat: [1], sat: [2] }
    mockFetch(
      JSON.stringify({ data: [] }),
      arxivResponse([]),
      openAlexResponse([
        {
          id: "W10",
          title: "Feline Posture Study",
          year: 2020,
          cited_by_count: 5,
          abstract_inverted_index: { The: [0], cat: [1], sat: [2] },
        },
      ])
    );

    const results = await searchAllSources("feline posture");
    expect(results.length).toBe(1);
    expect(results[0].abstract).toBe("The cat sat");
  });

  it("handles out-of-order positions in the inverted index", async () => {
    // Words stored in non-position order
    mockFetch(
      JSON.stringify({ data: [] }),
      arxivResponse([]),
      openAlexResponse([
        {
          id: "W11",
          title: "Quantum Entanglement Study",
          year: 2022,
          cited_by_count: 10,
          abstract_inverted_index: {
            entanglement: [1],
            Quantum: [0],
            explained: [2],
          },
        },
      ])
    );

    const results = await searchAllSources("quantum entanglement");
    expect(results.length).toBe(1);
    expect(results[0].abstract).toBe("Quantum entanglement explained");
  });

  it("handles a word that appears at multiple positions", async () => {
    // "the cat and the dog" → { the: [0, 3], cat: [1], and: [2], dog: [4] }
    mockFetch(
      JSON.stringify({ data: [] }),
      arxivResponse([]),
      openAlexResponse([
        {
          id: "W12",
          title: "Animal Behavior Study",
          year: 2021,
          cited_by_count: 3,
          abstract_inverted_index: {
            the: [0, 3],
            cat: [1],
            and: [2],
            dog: [4],
          },
        },
      ])
    );

    const results = await searchAllSources("animal behavior");
    expect(results.length).toBe(1);
    expect(results[0].abstract).toBe("the cat and the dog");
  });

  it("returns an empty string when abstract_inverted_index is null", async () => {
    mockFetch(
      JSON.stringify({ data: [] }),
      arxivResponse([]),
      openAlexResponse([
        {
          id: "W13",
          title: "Mystery Paper without Abstract",
          year: 2023,
          cited_by_count: 0,
          abstract_inverted_index: undefined,
        },
      ])
    );

    const results = await searchAllSources("mystery paper");
    expect(results.length).toBe(1);
    expect(results[0].abstract).toBe("");
  });

  it("handles an empty inverted index object and returns an empty string", async () => {
    mockFetch(
      JSON.stringify({ data: [] }),
      arxivResponse([]),
      openAlexResponse([
        {
          id: "W14",
          title: "Empty Abstract Robotics Paper",
          year: 2020,
          cited_by_count: 1,
          abstract_inverted_index: {},
        },
      ])
    );

    const results = await searchAllSources("robotics paper");
    expect(results.length).toBe(1);
    expect(results[0].abstract).toBe("");
  });
});

// ─── searchAllSources: result ordering ────────────────────────────────────────

describe("searchAllSources result ordering", () => {
  it("returns results sorted by citation count descending", async () => {
    mockFetch(
      s2Response([
        { paperId: "s2-low", title: "Symbolic Reasoning with Logic", year: 2019, citationCount: 10 },
        { paperId: "s2-high", title: "Deep Learning for Symbolic Math", year: 2020, citationCount: 500 },
      ]),
      arxivResponse([]),
      openAlexResponse([
        { id: "W15", title: "Probabilistic Symbolic Models", year: 2021, cited_by_count: 75 },
      ])
    );

    const results = await searchAllSources("symbolic");
    const counts = results.map((r) => r.citationCount);
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
    }
  });

  it("respects the limit parameter", async () => {
    const papers = Array.from({ length: 8 }, (_, i) => ({
      paperId: `s2-${i}`,
      title: `Attention Mechanism Paper Number ${i} on Transformers`,
      year: 2020,
      citationCount: i * 10,
    }));

    mockFetch(
      s2Response(papers),
      arxivResponse([]),
      openAlexResponse([])
    );

    const results = await searchAllSources("attention transformers", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ─── searchAllSources: relevance filtering ───────────────────────────────────

describe("searchAllSources relevance filtering", () => {
  it("drops papers with zero keyword overlap with the query", async () => {
    // Paper title shares no word >= 3 chars with query "transformers"
    mockFetch(
      s2Response([
        { paperId: "s2-unrelated", title: "A Study of Economic Policy", year: 2020, citationCount: 5 },
        { paperId: "s2-related", title: "Vision Transformers for Image Classification", year: 2021, citationCount: 200 },
      ]),
      arxivResponse([]),
      openAlexResponse([])
    );

    const results = await searchAllSources("transformers");
    // "Economic Policy" should be filtered out; "Transformers" should remain
    expect(results.some((r) => r.title.includes("Transformers"))).toBe(true);
    expect(results.every((r) => !r.title.includes("Economic Policy"))).toBe(true);
  });

  it("returns all results without filtering when query has no keyword >= 3 chars", async () => {
    // Query "AI" → after normalizeTitle and filter(>=3) = [] → no filter applied
    mockFetch(
      s2Response([
        { paperId: "s2-ai1", title: "Symbolic Reasoning Systems", year: 2020, citationCount: 10 },
      ]),
      arxivResponse([]),
      openAlexResponse([])
    );

    const results = await searchAllSources("AI");
    // No keyword filter → result included
    expect(results.length).toBe(1);
  });
});

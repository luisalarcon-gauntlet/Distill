# Distill

**Turn any research topic into a living knowledge wiki.**

Distill implements the [compiled wiki pattern](https://github.com/karpathy/LLM-Wiki) — instead of re-deriving knowledge on every query (like RAG), it uses an LLM to incrementally build and maintain a persistent, interlinked wiki from academic papers.

Enter a topic → Distill pulls papers from Semantic Scholar → an LLM compiles them into cross-referenced wiki pages (concepts, entities, source summaries) → you browse, explore, and keep building.

## Why

Most AI + documents tools are stateless. Upload files, ask a question, get an answer. Nothing accumulates. Distill is the opposite: every paper you add makes the wiki richer. Cross-references are built once. Contradictions are flagged. Synthesis compounds.

The tedious part of maintaining a knowledge base isn't reading — it's bookkeeping. Distill handles that.

## Quick Start

**Fork this repo first** — Distill is designed to run with your own API key, on your own machine.

1. Click **Fork** at the top of this page
2. Clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/distill.git
cd distill
cp .env.example .env.local
# Add your Anthropic or OpenAI API key to .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
docker build -t distill .
docker run -p 3000:3000 --env-file .env.local distill
```

## Configuration

Distill supports **BYO API key** — bring your own Claude or OpenAI key:

```env
# Use ONE of these:
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

It'll use whichever is set. Anthropic is preferred if both are present.

## How It Works

**Three layers** (following the [LLM Wiki architecture](https://github.com/karpathy/LLM-Wiki)):

1. **Sources** — Papers pulled from Semantic Scholar / arXiv. Immutable. Your source of truth.
2. **The Wiki** — LLM-generated markdown pages: overviews, concept pages, entity pages, source summaries. All interlinked. The LLM owns this layer.
3. **The Schema** — The prompts and conventions that tell the LLM how to compile, update, and maintain the wiki.

**Three operations:**

- **Compile** — Enter a topic, Distill searches for papers and generates a full wiki.
- **Ingest** — Add a new paper to an existing wiki. The LLM reads it, updates existing pages, creates new ones.
- **Lint** — Health-check the wiki: find contradictions, orphan pages, missing cross-references, gaps.

## API

All operations are exposed as REST endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/search?q=...` | GET | Search Semantic Scholar |
| `/api/generate` | POST | Create a new wiki from a topic |
| `/api/projects` | GET | List all wikis |
| `/api/projects/:id` | GET | Get wiki with all pages, sources, log |
| `/api/projects/:id/ingest` | POST | Add a paper to an existing wiki |
| `/api/projects/:id/lint` | POST | Health-check a wiki |

## Tech Stack

- **Next.js 14** — App router, API routes, React frontend
- **SQLite** (better-sqlite3) — Zero-config persistent storage
- **Semantic Scholar API** — Free academic paper search, no auth required
- **Anthropic / OpenAI** — BYO key, provider abstraction

## Roadmap

- [ ] Markdown export (Obsidian-compatible vault)
- [ ] PDF upload + ingestion
- [ ] Full-text arXiv paper reading
- [ ] Collaborative wikis (share link)
- [ ] Wiki search (BM25 + embeddings)
- [ ] Citation graph visualization
- [ ] Google Scholar integration
- [ ] Ollama / local model support

## Inspired By

- [LLM Wiki](https://github.com/karpathy/LLM-Wiki) by Andrej Karpathy — the pattern this implements
- [Vannevar Bush's Memex](https://en.wikipedia.org/wiki/Memex) (1945) — the original vision of a personal knowledge store with associative trails

## License

MIT

# Distill

**Turn any research topic into a living knowledge wiki.**

Distill implements the [compiled wiki pattern](https://github.com/karpathy/LLM-Wiki) — instead of re-deriving knowledge on every query (like RAG), it uses an LLM to incrementally build and maintain a persistent, interlinked wiki from academic papers. Every wiki is a folder of real markdown files on your filesystem.

Enter a topic. Distill pulls papers from Semantic Scholar, compiles them into cross-referenced wiki pages (concepts, entities, source summaries), and writes them as `.md` files you can open in any editor or Obsidian.

## Why

Most AI + documents tools are stateless. Upload files, ask a question, get an answer. Nothing accumulates.

Distill is the opposite: every paper you add makes the wiki richer. Cross-references are built once. Contradictions are flagged. Synthesis compounds. The tedious part of maintaining a knowledge base isn't reading — it's bookkeeping. Distill handles that.

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

## Configuration

Distill supports **BYO API key** — bring your own Claude or OpenAI key:

```env
# Use ONE of these:
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional: override default models
ANTHROPIC_MODEL=claude-sonnet-4-20250514
OPENAI_MODEL=gpt-4o
```

It'll use whichever is set. Anthropic is preferred if both are present.

## How It Works

**Three layers** (following the [LLM Wiki architecture](https://github.com/karpathy/LLM-Wiki)):

1. **Sources** — Papers pulled from Semantic Scholar / arXiv. Saved as raw markdown in `raw/`. Immutable.
2. **The Wiki** — LLM-generated markdown pages: overviews, concept pages, entity pages, source summaries. All interlinked with `[[Wiki Links]]`. Stored in `wiki/`.
3. **The Schema** — The `SCHEMA.md` file and prompts that tell the LLM how to compile, update, and maintain the wiki.

**Three operations:**

- **Compile** — Enter a topic, Distill searches for papers and generates a full wiki.
- **Ingest** — Add a new paper to an existing wiki. The LLM reads it, updates existing pages, creates new ones.
- **Lint** — Health-check the wiki: find contradictions, orphan pages, missing cross-references, gaps.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/browse?path=...` | GET | Browse directories (for brain creation) |
| `/api/brains` | GET | List all brains |
| `/api/brains` | POST | Create a new brain |
| `/api/brains/:id` | GET | Load brain with pages and log |
| `/api/brains/:id` | DELETE | Unregister brain (files stay on disk) |
| `/api/brains/:id/ingest` | POST | Add a paper to an existing wiki |
| `/api/brains/:id/lint` | POST | Health-check a wiki |
| `/api/brains/:id/query` | POST | Ask a question using wiki context |
| `/api/brains/:id/export` | GET | Download brain as tar.gz |

## Tech Stack

- **Next.js 14** — App Router, API routes, React frontend
- **Markdown + gray-matter** — Real `.md` files with YAML frontmatter, no database
- **Semantic Scholar API** — Free academic paper search, no auth required
- **Anthropic / OpenAI** — BYO key, provider abstraction via raw fetch

## Roadmap

- [ ] Obsidian export (already compatible — open the brain folder as a vault)
- [ ] PDF upload + ingestion
- [ ] Google Scholar integration
- [ ] Ollama / local model support
- [ ] Citation graph visualization
- [ ] Collaborative wikis (share link)

## Inspired By

- [LLM Wiki](https://github.com/karpathy/LLM-Wiki) by Andrej Karpathy — the compiled wiki pattern this implements
- [Vannevar Bush's Memex](https://en.wikipedia.org/wiki/Memex) (1945) — the original vision of a personal knowledge store with associative trails

## License

MIT

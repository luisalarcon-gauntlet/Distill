# Contributing to Distill

Distill is designed to be **forked and self-hosted**. The intended workflow:

1. **Fork** this repo to your own GitHub account
2. **Clone** your fork
3. **Add your own API key** (Anthropic or OpenAI)
4. **Run it** — it's yours

## I found a bug / want to add a feature

Pull requests to the main repo are welcome for:

- Bug fixes
- Documentation improvements
- New LLM provider integrations
- New source integrations (Google Scholar, PubMed, etc.)
- Performance improvements

PRs are reviewed by maintainers before merging. Please open an issue first for large changes.

## What NOT to submit

- API keys or credentials (the repo has `.gitignore` rules for this, but double check)
- Changes to the core wiki compilation prompts without discussion
- Features that require a hosted backend or SaaS dependency

## Setup for Development

```bash
git clone https://github.com/YOUR_USERNAME/distill.git
cd distill
cp .env.example .env.local
# Add your API key to .env.local
npm install
npm run dev
```

## Code Structure

```
app/                  # Next.js App Router
  api/
    browse/           # Directory picker endpoint
    brains/           # Brain CRUD + ingest, lint, query, export
  page.tsx            # Entry point
  layout.tsx          # Root layout with fonts
  globals.css         # CSS variables and Tailwind
components/
  WikiApp.tsx         # Main UI (brain selector, create flow, wiki viewer)
lib/
  llm.ts             # LLM provider abstraction (Claude / OpenAI)
  papers.ts           # Semantic Scholar + arXiv client
  compiler.ts         # Wiki compilation engine (LLM prompts)
  config.ts           # Brain registry (~/.distill/config.json)
  wiki-fs.ts          # Filesystem layer (read/write .md files)
```

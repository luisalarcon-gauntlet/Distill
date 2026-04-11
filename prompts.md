# Distill — Claude Code Build Prompts

Use these prompts sequentially with Claude Code. Each prompt is a self-contained task. Wait for each to complete and verify before moving to the next.

---

## Prompt 1: Project Setup ✅

```
Create a new Next.js 14 project called "distill" using the App Router with TypeScript and Tailwind CSS. 

Use these specific choices:
- App Router (not Pages)
- TypeScript
- Tailwind CSS
- No src/ directory — put app/ at root level
- ESLint yes

After creation, also install these dependencies:
- gray-matter (for parsing markdown frontmatter)

Create a .env.example file with:
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# OPENAI_MODEL=gpt-4o

Create a .gitignore that includes: node_modules, .next, .env.local, .env, wiki-data/

Do NOT use SQLite or any database. Do NOT create a Dockerfile. This app writes markdown files directly to the user's filesystem.
```

---

## Prompt 2: LLM Provider Abstraction ✅

```
Create lib/llm.ts — a provider abstraction that supports both Anthropic and OpenAI APIs.

Requirements:
- Auto-detect which provider to use based on which env var is set (ANTHROPIC_API_KEY or OPENAI_API_KEY). Prefer Anthropic if both are set.
- Allow model override via ANTHROPIC_MODEL or OPENAI_MODEL env vars. Defaults: claude-sonnet-4-20250514 for Anthropic, gpt-4o for OpenAI.
- Export two functions:
  1. llm(system: string, prompt: string, maxTokens?: number) → Promise<{ text: string }>
  2. llmJSON<T>(system: string, prompt: string, maxTokens?: number) → Promise<T> — calls llm, strips markdown fences, parses JSON
- Throw a clear error if no API key is found.
- Use fetch directly, no SDKs.
```

---

## Prompt 3: Semantic Scholar Client ✅

```
Create lib/papers.ts — a client for the Semantic Scholar API (free, no auth needed).

Export these functions:
1. searchPapers(query: string, limit?: number) → Promise<Paper[]>
   - Hits GET https://api.semanticscholar.org/graph/v1/paper/search
   - Fields: title, abstract, authors, year, citationCount, url, externalIds
   - Returns array of Paper objects: { id, title, authors: string[], year, abstract, url, citationCount }

2. getPaperByArxivId(arxivId: string) → Promise<Paper | null>
   - Hits GET https://api.semanticscholar.org/graph/v1/paper/ARXIV:{id}

3. getRelatedPapers(paperId: string, limit?: number) → Promise<Paper[]>
   - Hits the recommendations endpoint

Add a User-Agent header: "Distill/0.1 (research-wiki-tool)"
Handle errors gracefully — return empty arrays, not crashes.
```

---

## Prompt 4: Config Manager (Brain Registry) ✅

```
Create lib/config.ts — manages the registry of brains.

Brains are stored in a config file at ~/.distill/config.json. Each brain has:
- id: string (unique slug)
- name: string (display name)  
- path: string (absolute filesystem path to the brain's folder)
- topic: string (research topic)
- created: string (ISO date)
- lastOpened: string (ISO date)

Export these functions:
- listBrains() → BrainConfig[] — returns all registered brains, filters out any whose path no longer exists on disk
- getBrain(id: string) → BrainConfig | null
- registerBrain(brain: BrainConfig) → void — adds or updates a brain in the config
- removeBrain(id: string) → void — removes from config (does NOT delete files on disk)
- setLastActive(id: string) → void — updates lastOpened timestamp
- generateBrainId(name: string) → string — creates a unique slug from the name

Ensure ~/.distill/ directory is created if it doesn't exist.
```

---

## Prompt 5: Wiki Filesystem Layer ✅

```
Create lib/wiki-fs.ts — handles reading and writing the wiki as real .md files on disk.

A brain's folder structure looks like this:
brain-folder/
├── SCHEMA.md          # conventions for the LLM
├── index.md           # auto-maintained catalog of all pages
├── log.md             # append-only timeline of operations
├── raw/               # saved source documents (immutable)
├── wiki/              # LLM-generated pages
│   ├── overview.md
│   ├── concepts/
│   ├── entities/
│   ├── sources/
│   └── analyses/
└── exports/

Every wiki page is a markdown file with YAML frontmatter:
---
title: Page Title
type: concept
sources: []
links: [other-page-id]
created: 2026-04-11
updated: 2026-04-11
---

# Page Title
Content here with [[Wiki Links]]...

Export these functions:
- initWikiDir(wikiDir: string, topic: string) → void — creates all directories + SCHEMA.md + index.md + log.md
- writePage(wikiDir, page: { id, title, type, content, links, sources }) → string (returns relative filepath)
- readPage(wikiDir, filepath) → WikiPage | null — parses frontmatter + content
- readAllPages(wikiDir) → WikiPage[] — recursively reads all .md files under wiki/
- rebuildIndex(wikiDir, topic) → void — regenerates index.md from all current pages
- appendLog(wikiDir, action, detail) → void — appends "## [timestamp] action | detail" to log.md
- readLog(wikiDir) → { date, action, detail }[] — parses log.md entries
- saveRawSource(wikiDir, id, content) → string — writes to raw/

Use the gray-matter library for parsing/serializing frontmatter.
Map page types to subdirectories: overview→wiki/, concept→wiki/concepts/, entity→wiki/entities/, source→wiki/sources/, analysis→wiki/analyses/
```

---

## Prompt 6: Wiki Compiler (LLM Prompts) ✅

```
Create lib/compiler.ts — the core logic that turns papers into interlinked wiki pages via LLM.

This file has three main functions:

1. compileWiki(topic: string, papers: Paper[]) → Promise<{ pages: Record<string, WikiPage> }>
   - Takes a topic and array of papers
   - Builds a context string from all paper titles, authors, abstracts, citation counts
   - Sends to llmJSON with a system prompt instructing it to generate:
     - 1 overview page
     - 3-6 concept/entity pages
     - 2-3 source summary pages
   - Requires [[Wiki Link]] syntax in content, cross-references between all pages
   - Returns pages as a JSON object keyed by page ID

2. ingestSource(existingPages: WikiPage[], newPaper: Paper) → Promise<{ updated: WikiPage[], created: WikiPage[] }>
   - Takes existing wiki pages and a new paper
   - LLM decides which existing pages need updating and what new pages to create
   - Returns separate arrays of updated and newly created pages

3. lintWiki(pages: WikiPage[]) → Promise<{ issues: { type, description, page? }[], suggestions: string[] }>
   - LLM analyzes all pages for: orphan pages, contradictions, missing links, thin coverage, gaps
   - Returns structured issues and suggestions

For all three functions, use a shared system prompt that establishes the LLM as a "knowledge wiki compiler" with rules about:
- Using [[Page Title]] wiki-link syntax
- Kebab-case page IDs
- Substantive content (3-6 paragraphs per page)
- Cross-referencing heavily
- Flagging contradictions explicitly
- Using markdown formatting

Use llmJSON from lib/llm.ts. Request max_tokens of 8192 for compile/ingest, 4096 for lint.
```

---

## Prompt 7: API Routes — Browse & Brains ✅

```
Create these Next.js App Router API routes:

1. app/api/browse/route.ts — GET
   - Query param: ?path=/some/directory (defaults to user's home directory)
   - Returns: { current: string, parent: string|null, dirs: { name, path }[] }
   - Lists only subdirectories (not files)
   - Skips hidden dirs (starting with .), node_modules, __pycache__, system dirs
   - Checks readability before including a dir
   - This powers the directory picker in the frontend

2. app/api/brains/route.ts — GET and POST
   - GET: returns { brains: BrainConfig[] } from listBrains()
   - POST: creates a new brain
     - Body: { name, topic, directory, autoCompile?: boolean }
     - Creates brain folder inside the chosen directory as a subfolder (slugified name)
     - Calls initWikiDir to set up the folder structure
     - If autoCompile is true: searches papers, compiles wiki, writes all .md files
     - Registers brain in config
     - Returns { brain, pageCount, sourceCount }

3. app/api/brains/[id]/route.ts — GET and DELETE
   - GET: reads brain from config, reads all pages and log from disk, returns { brain, pages, log }
   - DELETE: calls removeBrain (unregisters, does NOT delete files)

4. app/api/brains/[id]/ingest/route.ts — POST
   - Body: { query?: string, arxivId?: string }
   - Finds the paper via Semantic Scholar
   - Saves raw source to raw/
   - Calls ingestSource with existing pages
   - Writes updated/new pages to disk
   - Rebuilds index, appends to log
   - Returns { paper, updated, created }

5. app/api/brains/[id]/lint/route.ts — POST
   - Reads all pages, calls lintWiki
   - Returns { issues, suggestions }

6. app/api/brains/[id]/query/route.ts — POST
   - Body: { question, saveAsPage?: boolean }
   - Reads all wiki pages, sends as context to LLM with the question
   - If saveAsPage is true, writes the answer as a new analysis page
   - Returns { answer, savedAsPage }

7. app/api/brains/[id]/export/route.ts — GET
   - Creates a tar.gz of the brain directory
   - Returns it as a download

All routes should use the config manager to look up brain paths, and the wiki-fs layer to read/write files. Handle errors with try/catch and return proper status codes.
```

---

## Prompt 8: Frontend — Brain Selector ✅

```
Create the main frontend as a client component at components/WikiApp.tsx, imported by app/page.tsx.

The app has 4 screens: "brains" (selector), "create" (new brain form), "loading", and "wiki" (viewer).

Start with the BRAIN SELECTOR screen (shown on launch):

- Full screen, centered layout
- Header: "Distill" label + "Your Brains" title + subtitle "Each brain is a self-contained knowledge wiki on your filesystem"
- Grid of brain cards showing: name, topic, page count, filesystem path, and a "remove" button (hover-visible)
- A "+ New Brain" card with dashed border that navigates to the create screen
- Error banner if something fails
- Clicking a brain card loads it and switches to wiki view

Design: dark theme (#0a0a0f background), IBM Plex Mono for headings/labels, IBM Plex Sans for body. Accent color #c4a1ff (purple). Import fonts from Google Fonts.

Don't use any component libraries. Plain React + Tailwind + inline styles.
```

---

## Prompt 9: Frontend — Create Brain Flow ✅

```
Add the CREATE BRAIN screen to WikiApp.tsx.

This screen has:
- Back button (← Back) to return to brain selector
- "Create a New Brain" heading
- Form fields:
  1. Brain name — text input
  2. Research topic — text input  
  3. Directory picker — a component that:
     - Calls GET /api/browse to list directories
     - Shows current path with a "Select" button
     - Has a ".." entry to go up
     - Lists subdirectories as clickable rows with folder icons
     - Max height ~240px with scroll
  4. Preview showing: "Brain will be created at: {selectedDir}/{slugified-name}/"
  5. "Auto-compile on creation" checkbox (default: checked) with explanation text
  6. "Create Brain →" button (disabled until all fields filled)

When Create is clicked:
- Switch to loading screen
- POST to /api/brains with { name, topic, directory, autoCompile }
- On success, refresh brain list and open the new brain
- On error, show error and go back to create screen
```

---

## Prompt 10: Frontend — Wiki Viewer ✅

```
Add the WIKI VIEWER screen to WikiApp.tsx. This is shown when a brain is open.

Layout: sidebar (280px fixed) + main content area.

SIDEBAR:
- Header: "← All Brains" button, brain name, page count + path
- Ingest bar: text input "Add a paper..." with + button
- Action buttons row: "Health Check" button (amber) + "Export" button (green)
- Tab bar: pages | graph | log
- Pages tab: sorted list of pages (overview first, then concepts, entities, sources, analyses). Each shows title + type badge. Active page highlighted with purple left border.
- Graph tab: force-directed graph visualization on a canvas. Nodes colored by type. Edges drawn between linked pages. Clickable nodes navigate to that page.
- Log tab: chronological list of operations with colored action badges

MAIN CONTENT:
- Query bar at top: "Ask a question about this brain..." input + Ask button
- Query answer panel (dismissable): shows LLM response with "Save as page" button
- Lint results panel (dismissable): shows issues + suggestions
- Page viewer: renders the active page's markdown content with:
  - [[Wiki Link]] syntax rendered as clickable links that navigate to that page
  - ## headings, **bold**, `code blocks`, bullet points
  - Type badge + filepath shown above title
  - Linked pages section at bottom with clickable tags

Navigation: clicking a [[Wiki Link]] should try exact ID match, then slugified match, then fuzzy title match across all pages.
```

---

## Prompt 11: README & Open Source Files ✅

```
Create these files for the open source repo:

README.md:
- Project name "Distill" with tagline "Turn any research topic into a living knowledge wiki"
- Explain the compiled wiki pattern (cite Karpathy's LLM Wiki)
- "Why" section: RAG is stateless, Distill compounds knowledge
- Quick Start: fork-first instructions (Fork → Clone → add API key → npm install → npm run dev)
- Configuration section: BYO API key (Anthropic or OpenAI)
- How It Works: three layers (sources, wiki, schema) and three operations (compile, ingest, lint)
- API endpoints table
- Tech stack
- Roadmap with checkboxes: Obsidian export, PDF upload, Google Scholar, Ollama support, citation graph, collaborative wikis
- "Inspired By" section mentioning Karpathy's LLM Wiki and Vannevar Bush's Memex
- MIT license

CONTRIBUTING.md:
- Explain fork-first model
- List what PRs are welcome (bug fixes, new integrations, docs)
- List what NOT to submit (API keys, prompt changes without discussion, SaaS dependencies)
- Development setup instructions
- Code structure overview

LICENSE — MIT license, Copyright 2026 Distill Contributors

.env.example — with both API key options and model override options
```

---

## Prompt 12: Testing & Polish

```
Run the application with `npm run dev` and test these flows:

1. Open http://localhost:3000 — should see brain selector with no brains
2. Click "+ New Brain" — should see create form with directory picker
3. Browse to a test directory using the picker
4. Fill in name: "Test Brain", topic: "transformer architecture", check auto-compile
5. Click Create → should show loading, then open the wiki viewer with generated pages
6. Browse pages in the sidebar — each should render with content and wiki links
7. Click a [[wiki link]] — should navigate to that page
8. Type a question in the query bar and click Ask — should get an LLM response
9. Click "Health Check" — should show lint results
10. Click "Export" — should download a tar.gz

Fix any bugs you find. Common issues to watch for:
- gray-matter import issues (may need to be imported differently in Next.js server components)
- File path issues on Windows (use path.join everywhere, handle both / and \)
- The graph canvas not rendering (check canvas ref lifecycle)
- API routes returning 500 with no error message (add console.error in catch blocks)

Also verify that the brain folder was actually created on disk with real .md files that can be opened in any text editor or Obsidian.
```

---

## Notes for the Agent

- This is a LOCAL-FIRST app. Everything runs on the user's machine. No cloud, no auth, no Docker.
- The entire value proposition is that wikis are REAL MARKDOWN FILES on disk. If you're tempted to store anything in a database, don't.
- Every wiki operation should append to log.md and rebuild index.md.
- The LLM prompts in compiler.ts are critical — they need to produce well-structured JSON with substantive content and real cross-references. Test them and iterate if the output quality is poor.
- The directory picker is important UX — users need to choose WHERE their brain lives. Don't skip this.
- Keep the frontend in a single WikiApp.tsx file for now. Don't over-abstract into 20 component files.
# Roadmap: Distill Undergrad Pivot

## Overview

Six phases transform Distill from a researcher-oriented "brain" tool into a course-first study companion for undergrads. Phase 1 lays the type and token foundation so nothing built afterward needs to be retrofitted. Phase 2 delivers the term dashboard — the new home screen — and validates the decomposition strategy. Phase 3 adds syllabus import, the highest-leverage differentiator. Phase 4 wires the course viewer and 5-tab Add Sources modal, which are tightly coupled and must ship together. Phase 5 redesigns flashcard review with CSS 3D flip and Got/Miss binary rating. Phase 6 completes the icon system, warms the copy for undergrads, and audits the entire surface for consistency.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Types, CSS tokens, theme provider, and screen contract that every subsequent phase depends on
- [ ] **Phase 2: App Shell + Dashboard** - Course model fields, term dashboard home screen, course cards grid, Week Ahead sidebar
- [ ] **Phase 3: Syllabus Import** - Drag-drop PDF upload, reading/assessment extraction, review step, notebook creation
- [ ] **Phase 4: Course Viewer + Add Sources Modal** - Course viewer with sidebar tabs, 5-tab ingest modal, assignment cross-reference, component decomposition
- [ ] **Phase 5: Flashcard Review Redesign** - CSS 3D flip animation, Got/Miss binary rating, progress bar, deck-complete summary
- [ ] **Phase 6: Icons, Voice & Polish** - Lucide icon system, undergrad copy warmth, ExamPrep promotion, final consistency audit

## Phase Details

### Phase 1: Foundation
**Goal**: The shared type system, CSS design tokens, and theme infrastructure are in place so all subsequent screen components can be built without retrofitting
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, ARCH-02, ARCH-03, ARCH-04
**Success Criteria** (what must be TRUE):
  1. Toggling between Dark and Library modes produces a visible color change with no hydration flash on page load
  2. All shared TypeScript types (Brain, Screen, etc.) resolve from a single components/shared/types.ts with no duplicate definitions elsewhere
  3. WikiGraph and PageView exist as standalone files in components/shared/ and are importable without touching WikiApp.tsx
  4. Every CSS custom property referenced in components resolves to a token defined in globals.css — no dangling var() references
  5. tailwind.config.js and next.config.js changes are committed and the dev server starts cleanly
**Plans**: 2 plans
Plans:
- [ ] 01-01-PLAN.md — Shared types extraction and WikiGraph/PageView component isolation
- [ ] 01-02-PLAN.md — CSS token expansion, Tailwind/Next.js config, ThemeProvider + ThemeToggle
**UI hint**: yes

### Phase 2: App Shell + Dashboard
**Goal**: Users land on a term dashboard showing their courses as color-accented cards with a Week Ahead sidebar, replacing the old flat brain list
**Depends on**: Phase 1
**Requirements**: COURSE-01, COURSE-02, COURSE-03, COURSE-04, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. The app home screen is a course cards grid, not a brain list — each card shows course code, name, semester, page count, and a 3px left accent stripe in its assigned color
  2. A Week Ahead sidebar panel is visible on the dashboard and shows upcoming items from any existing exam prep session
  3. Clicking "Import syllabus" navigates to the syllabus import screen; clicking "New course" opens a create-course flow
  4. The theme toggle in the dashboard header switches between Dark and Library modes and the selection persists on refresh
  5. A summary stats line shows total course count and compiled page count
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Course model fields (BrainConfig extension, COURSE_COLORS, API update)
- [ ] 02-02-PLAN.md — Term dashboard UI (DashboardScreen, CourseCard, WeekAheadSidebar, page.tsx wiring)
**UI hint**: yes

### Phase 3: Syllabus Import
**Goal**: A student can drag-drop their syllabus PDF, review extracted readings and assessments, and create a course notebook in under two minutes
**Depends on**: Phase 2
**Requirements**: SYLL-01, SYLL-02, SYLL-03, SYLL-04, SYLL-05
**Success Criteria** (what must be TRUE):
  1. A student can drag a syllabus PDF onto the upload zone and see it accepted without a file picker
  2. After upload, the app displays extracted readings and assessments for the student to review and edit before committing
  3. Clicking "Create notebook" from the review step scaffolds a course notebook and returns the student to the dashboard with the new course card visible
  4. The new course's brain config is pre-populated with the extracted course code, instructor name, and semester
**Plans**: 2 plans
Plans:
- [ ] 03-01-PLAN.md — Parse API + SyllabusImport drop zone through review step (SYLL-01, SYLL-02, SYLL-03, SYLL-05)
- [ ] 03-02-PLAN.md — Create notebook submission + page.tsx screen router (SYLL-04, SYLL-05)
**UI hint**: yes

### Phase 4: Course Viewer + Add Sources Modal
**Goal**: Students can read compiled wiki pages inside a course, add new sources through a unified 5-tab modal, and see which readings relate to which assignments
**Depends on**: Phase 3
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06, INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05, INGEST-06, INGEST-07, INGEST-08, INGEST-09, ARCH-01
**Success Criteria** (what must be TRUE):
  1. Opening a course shows a 280px sidebar with Pages, Assignments, and Log tabs alongside a main content reader that renders wiki pages with [[Wiki Links]] and type badges
  2. Clicking "Add sources" opens a modal with exactly 5 tabs — Auto-research, Search papers, Paste DOI/URL, Upload PDF, and Sources — and focus is trapped inside the modal
  3. The Auto-research tab runs a staged flow (searching → selecting → compiling → done) with a terminal-style log; the student can uncheck papers before compile
  4. The assignment cross-reference panel maps problem-set questions to related wiki page chips
  5. WikiApp.tsx is decomposed into App.tsx and six screen components; no screen file exceeds what a single developer can scan in one sitting
**Plans**: 4 plans
Plans:
- [ ] 04-01-PLAN.md — CourseViewer + CourseSidebar (core viewer extracted from WikiApp.tsx)
- [ ] 04-02-PLAN.md — AddSourcesModal shell + Auto-research tab (portal, focus trap, useReducer state machine)
- [ ] 04-03-PLAN.md — AddSourcesModal remaining tabs (Search papers, Paste DOI/URL, Upload PDF, Sources) + footer CTA
- [ ] 04-04-PLAN.md — AssignmentPanel + app/page.tsx routing + ARCH-01 completion
**UI hint**: yes

### Phase 5: Flashcard Review Redesign
**Goal**: The flashcard review screen feels like a physical card deck — smooth 3D flip, binary Got/Miss rating, visible progress, and a completion summary
**Depends on**: Phase 4
**Requirements**: FLASH-01, FLASH-02, FLASH-03, FLASH-04, FLASH-05
**Success Criteria** (what must be TRUE):
  1. Clicking a flashcard triggers a CSS 3D flip animation that reveals the answer on the back face without JavaScript keyframes
  2. Got and Miss buttons are the only rating options — the old 4-button confidence scale is gone
  3. A progress bar shows the current card position (e.g., "Card 4 of 20") with an accent-colored fill that advances with each rating
  4. After the last card is rated, a deck-complete summary screen appears with "Review again" and "Back to course" actions
  5. Navigation arrows allow moving forward and backward through cards without rating
**Plans**: 1 plan
Plans:
- [ ] 05-01-PLAN.md — FlashcardReview component (3D flip, Got/Miss, progress bar, summary, arrows) + page.tsx wiring
**UI hint**: yes

### Phase 6: Icons, Voice & Polish
**Goal**: The UI speaks in an undergrad-appropriate voice, every interactive surface has a Lucide-style icon where it aids clarity, and the full product passes a consistency audit
**Depends on**: Phase 5
**Requirements**: ICON-01, ICON-02, VOICE-01, VOICE-02
**Success Criteria** (what must be TRUE):
  1. An Icon component renders ~20 Lucide-style inline SVGs at 14–18px with 1.5px stroke and currentColor — no external SVG files, no icon font
  2. Icons appear in buttons, sidebar tabs, and agenda rows where they reinforce meaning; decorative use is absent
  3. User-facing strings use undergrad-warm phrasing ("This term", "Pick a page...", "New course") with no emoji and no exclamation points
  4. A full-surface audit finds no inline hex values, no duplicate type definitions, and no screen that is still served by the old WikiApp.tsx monolith
**Plans**: 1 plan
Plans:
- [ ] 06-01-PLAN.md — Icon component + icon placement on interactive surfaces + copy audit
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/2 | Not started | - |
| 2. App Shell + Dashboard | 0/2 | Not started | - |
| 3. Syllabus Import | 0/2 | Not started | - |
| 4. Course Viewer + Add Sources Modal | 0/4 | Not started | - |
| 5. Flashcard Review Redesign | 0/1 | Not started | - |
| 6. Icons, Voice & Polish | 0/1 | Not started | - |

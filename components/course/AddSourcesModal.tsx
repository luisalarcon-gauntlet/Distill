"use client";

import { useState, useEffect, useReducer, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Paper, WikiPage } from "@/components/shared/types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AddSourcesModalProps {
  open: boolean;
  brainId: string;
  pages: WikiPage[];
  onClose: () => void;
  onIngestComplete: () => void;
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type ModalTab =
  | "auto-research"
  | "search-papers"
  | "paste-doi"
  | "upload-pdf"
  | "sources";

const TABS: { id: ModalTab; label: string }[] = [
  { id: "auto-research", label: "Auto-research" },
  { id: "search-papers", label: "Search papers" },
  { id: "paste-doi", label: "Paste DOI/URL" },
  { id: "upload-pdf", label: "Upload PDF" },
  { id: "sources", label: "Sources" },
];

// ─── Source badge constants ───────────────────────────────────────────────────

const SOURCE_LABELS: Record<Paper["source_api"], string> = {
  semantic_scholar: "S2",
  arxiv: "arXiv",
  openalex: "OpenAlex",
};

// CSS variable names for source fg/bg — no hardcoded hex
const SOURCE_FG: Record<Paper["source_api"], string> = {
  semantic_scholar: "var(--link)",        // #90c4ff
  arxiv:            "var(--warn)",         // #d4a855
  openalex:         "var(--success)",      // #7ec99a
};

const SOURCE_BG: Record<Paper["source_api"], string> = {
  semantic_scholar: "var(--accent-08)",    // rgba(144,196,255,0.12) ≈ accent-08 for token purity
  arxiv:            "rgba(212,168,85,0.12)",   // no direct var — using rgba of warn
  openalex:         "rgba(126,201,154,0.12)",  // no direct var — using rgba of success
};

// ─── Auto-research state machine ──────────────────────────────────────────────

type AutoStage = "idle" | "searching" | "selecting" | "compiling" | "done" | "error";

interface AutoState {
  stage: AutoStage;
  topic: string;
  log: string[];
  candidates: Paper[];
  selected: Set<string>;
  error: string | null;
}

type AutoAction =
  | { type: "START"; topic: string }
  | { type: "SEARCH_DONE"; papers: Paper[] }
  | { type: "TOGGLE"; paperId: string }
  | { type: "COMPILE_START" }
  | { type: "COMPILE_DONE" }
  | { type: "LOG"; line: string }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

const AUTO_INITIAL: AutoState = {
  stage: "idle",
  topic: "",
  log: [],
  candidates: [],
  selected: new Set<string>(),
  error: null,
};

function autoReducer(state: AutoState, action: AutoAction): AutoState {
  switch (action.type) {
    case "START":
      return {
        ...state,
        stage: "searching",
        topic: action.topic,
        log: [`Searching for papers on "${action.topic}"...`],
        candidates: [],
        selected: new Set<string>(),
        error: null,
      };

    case "SEARCH_DONE": {
      const allIds = new Set(action.papers.map((p) => p.id));
      return {
        ...state,
        stage: "selecting",
        candidates: action.papers,
        selected: allIds,
        log: [
          ...state.log,
          `Found ${action.papers.length} paper${action.papers.length !== 1 ? "s" : ""}. Review and uncheck any to exclude.`,
        ],
      };
    }

    case "TOGGLE": {
      const next = new Set(state.selected);
      if (next.has(action.paperId)) {
        next.delete(action.paperId);
      } else {
        next.add(action.paperId);
      }
      return { ...state, selected: next };
    }

    case "COMPILE_START":
      return {
        ...state,
        stage: "compiling",
        log: [
          ...state.log,
          `Compiling wiki from ${state.selected.size} paper${state.selected.size !== 1 ? "s" : ""}...`,
        ],
      };

    case "COMPILE_DONE":
      return {
        ...state,
        stage: "done",
        log: [...state.log, "Done. Wiki updated."],
      };

    case "LOG":
      return { ...state, log: [...state.log, action.line] };

    case "ERROR":
      return { ...state, stage: "error", error: action.message };

    case "RESET":
      return { ...AUTO_INITIAL, selected: new Set<string>() };

    default:
      return state;
  }
}

// ─── File size helper ─────────────────────────────────────────────────────────

const formatFileSize = (bytes: number) =>
  bytes < 1048576
    ? (bytes / 1024).toFixed(1) + " KB"
    : (bytes / 1048576).toFixed(1) + " MB";

// ─── AddSourcesModal ──────────────────────────────────────────────────────────

export function AddSourcesModal({
  open,
  brainId,
  pages,
  onClose,
  onIngestComplete,
}: AddSourcesModalProps) {
  // ── Tab navigation ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ModalTab>("auto-research");

  // ── Auto-research tab state ─────────────────────────────────────────────────
  const [autoTopic, setAutoTopic] = useState("");
  const [autoState, dispatch] = useReducer(autoReducer, {
    ...AUTO_INITIAL,
    selected: new Set<string>(),
  });

  // ── Search papers tab state ─────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [searchSearching, setSearchSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchAdded, setSearchAdded] = useState<Set<string>>(new Set());

  // ── Paste DOI tab state ─────────────────────────────────────────────────────
  const [doiInput, setDoiInput] = useState("");
  const [doiResolved, setDoiResolved] = useState<Paper | null>(null);
  const [doiResolving, setDoiResolving] = useState(false);
  const [doiError, setDoiError] = useState<string | null>(null);

  // ── Upload PDF tab state ────────────────────────────────────────────────────
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [uploadDragOver, setUploadDragOver] = useState(false);

  // ── Shared queued papers for footer CTA ────────────────────────────────────
  const [queuedPapers, setQueuedPapers] = useState<Paper[]>([]);

  // ── Footer compile state ────────────────────────────────────────────────────
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const modalRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── Focus trap + Escape ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const focusFirst = () => {
      if (!modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
      if (focusable.length > 0) focusable[0].focus();
    };

    const rafId = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
        ).filter((el) => !el.hasAttribute("disabled"));

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // ── Auto-research: side effects watching stage ──────────────────────────────
  useEffect(() => {
    if (autoState.stage === "searching") {
      fetch(`/api/brains/${brainId}/ingest/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: autoState.topic }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            dispatch({ type: "ERROR", message: data.error });
            return;
          }
          dispatch({ type: "SEARCH_DONE", papers: data.papers || [] });
        })
        .catch((e) => dispatch({ type: "ERROR", message: e.message }));
    }

    if (autoState.stage === "compiling") {
      const chosen = autoState.candidates.filter((p) => autoState.selected.has(p.id));
      fetch(`/api/brains/${brainId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: chosen }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            dispatch({ type: "ERROR", message: data.error });
            return;
          }
          dispatch({ type: "COMPILE_DONE" });
          onIngestComplete();
        })
        .catch((e) => dispatch({ type: "ERROR", message: e.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoState.stage]);

  // ── Terminal log auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [autoState.log]);

  // ── Backdrop click ──────────────────────────────────────────────────────────
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // ── Search papers: handlers ─────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/brains/${brainId}/ingest/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSearchResults(data.papers || []);
    } catch (e: any) {
      setSearchError(e.message);
    } finally {
      setSearchSearching(false);
    }
  }, [searchQuery, brainId]);

  const handleAddPaper = useCallback((paper: Paper) => {
    setQueuedPapers((prev) => {
      if (prev.find((p) => p.id === paper.id)) return prev;
      return [...prev, paper];
    });
    setSearchAdded((prev) => new Set([...prev, paper.id]));
  }, []);

  // ── Paste DOI: handler ──────────────────────────────────────────────────────
  const handleResolve = useCallback(async () => {
    if (!doiInput.trim()) return;
    setDoiResolving(true);
    setDoiError(null);
    setDoiResolved(null);
    try {
      const res = await fetch(`/api/brains/${brainId}/ingest/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: doiInput.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const paper = data.papers?.[0] ?? null;
      if (!paper) throw new Error("No paper found for this identifier");
      setDoiResolved(paper);
    } catch (e: any) {
      setDoiError(e.message);
    } finally {
      setDoiResolving(false);
    }
  }, [doiInput, brainId]);

  // ── Footer: compile handler ─────────────────────────────────────────────────
  const handleCompileQueued = useCallback(async () => {
    if (queuedPapers.length === 0) return;
    setCompiling(true);
    setCompileError(null);
    try {
      const res = await fetch(`/api/brains/${brainId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: queuedPapers }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQueuedPapers([]);
      setSearchAdded(new Set());
      onIngestComplete();
      onClose();
    } catch (e: any) {
      setCompileError(e.message);
    } finally {
      setCompiling(false);
    }
  }, [queuedPapers, brainId, onIngestComplete, onClose]);

  // ── SSR guard ──────────────────────────────────────────────────────────────
  if (typeof document === "undefined" || !open) return null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSourceBadge = (api: Paper["source_api"]) => (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-10)",
        color: SOURCE_FG[api],
        background: SOURCE_BG[api],
        border: `1px solid ${SOURCE_FG[api]}`,
        borderRadius: "var(--r-sm)",
        padding: "1px 5px",
        whiteSpace: "nowrap",
        opacity: 0.9,
      }}
    >
      {SOURCE_LABELS[api]}
    </span>
  );

  const renderAutoResearchTab = () => {
    const { stage, log, candidates, selected } = autoState;
    const isbusy = stage === "searching" || stage === "compiling";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Topic input row */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={autoTopic}
            onChange={(e) => setAutoTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && autoTopic.trim() && stage === "idle") {
                dispatch({ type: "START", topic: autoTopic.trim() });
              }
            }}
            disabled={stage !== "idle"}
            placeholder="e.g. photosynthesis mechanisms"
            style={{
              flex: 1,
              background: "var(--surface)",
              border: "var(--hairline)",
              borderRadius: "var(--r-md)",
              padding: "8px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-13)",
              color: "var(--fg-strong)",
              outline: "none",
              opacity: stage !== "idle" ? 0.5 : 1,
            }}
          />
          {stage === "idle" && (
            <button
              onClick={() => {
                if (autoTopic.trim()) {
                  dispatch({ type: "START", topic: autoTopic.trim() });
                }
              }}
              disabled={!autoTopic.trim()}
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                border: "none",
                borderRadius: "var(--r-md)",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-13)",
                fontWeight: 600,
                cursor: autoTopic.trim() ? "pointer" : "not-allowed",
                opacity: autoTopic.trim() ? 1 : 0.5,
                whiteSpace: "nowrap",
              }}
            >
              Research
            </button>
          )}
          {isbusy && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-12)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                animation: "distill-pulse 1.5s ease-in-out infinite",
              }}
            >
              {stage === "searching" ? "Searching..." : "Compiling..."}
            </span>
          )}
        </div>

        {/* Terminal log */}
        {log.length > 0 && (
          <div
            ref={logRef}
            style={{
              background: "var(--bg)",
              border: "var(--hairline)",
              borderRadius: "var(--r-md)",
              padding: "var(--s-3)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-11)",
              color: "var(--success)",
              maxHeight: 120,
              overflowY: "auto",
              lineHeight: 1.6,
            }}
          >
            {log.map((line, i) => (
              <div key={i}>&gt; {line}</div>
            ))}
          </div>
        )}

        {/* Paper checklist — selecting stage */}
        {stage === "selecting" && candidates.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {candidates.map((paper) => {
              const isChecked = selected.has(paper.id);
              const truncatedTitle =
                paper.title.length > 90
                  ? paper.title.slice(0, 90) + "…"
                  : paper.title;
              return (
                <label
                  key={paper.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 4px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => dispatch({ type: "TOGGLE", paperId: paper.id })}
                    style={{
                      marginTop: 2,
                      accentColor: "var(--accent)",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: "var(--text-13)",
                        color: "var(--fg-strong)",
                        lineHeight: 1.4,
                      }}
                    >
                      {truncatedTitle}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-11)",
                        color: "var(--fg-faint)",
                        marginTop: 2,
                      }}
                    >
                      {paper.year ?? "n.d."} · {paper.source_api}
                      {paper.authors.length > 0
                        ? ` · ${paper.authors[0]}${paper.authors.length > 1 ? " et al." : ""}`
                        : ""}
                    </div>
                  </div>
                </label>
              );
            })}

            <button
              onClick={() => dispatch({ type: "COMPILE_START" })}
              disabled={selected.size === 0}
              style={{
                marginTop: 8,
                background: selected.size > 0 ? "var(--accent)" : "var(--border)",
                color: selected.size > 0 ? "var(--bg)" : "var(--fg-faint)",
                border: "none",
                borderRadius: "var(--r-md)",
                padding: "9px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-13)",
                fontWeight: 600,
                cursor: selected.size > 0 ? "pointer" : "not-allowed",
                alignSelf: "flex-start",
              }}
            >
              Compile selected ({selected.size})
            </button>
          </div>
        )}

        {/* Selecting — no candidates */}
        {stage === "selecting" && candidates.length === 0 && (
          <div
            style={{
              fontSize: "var(--text-13)",
              color: "var(--fg-muted)",
              padding: "8px 0",
            }}
          >
            No papers found. Try a different topic.
          </div>
        )}

        {/* Done stage */}
        {stage === "done" && (
          <button
            onClick={() => {
              dispatch({ type: "RESET" });
              setAutoTopic("");
            }}
            style={{
              background: "none",
              border: "var(--hairline)",
              borderRadius: "var(--r-md)",
              padding: "7px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-12)",
              color: "var(--fg-muted)",
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Add more sources
          </button>
        )}

        {/* Error stage */}
        {stage === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: "var(--text-13)",
                color: "var(--danger)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Error: {autoState.error}
            </div>
            <button
              onClick={() => {
                dispatch({ type: "RESET" });
                setAutoTopic("");
              }}
              style={{
                background: "none",
                border: "var(--hairline)",
                borderRadius: "var(--r-md)",
                padding: "7px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-12)",
                color: "var(--fg-muted)",
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderSearchPapersTab = () => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Search bar row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !searchSearching) handleSearch();
          }}
          disabled={searchSearching}
          placeholder="Search Semantic Scholar, arXiv, OpenAlex..."
          style={{
            flex: 1,
            background: "var(--surface)",
            border: "var(--hairline)",
            borderRadius: "var(--r-md)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-13)",
            color: "var(--fg-strong)",
            outline: "none",
            opacity: searchSearching ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleSearch}
          disabled={searchSearching || !searchQuery.trim()}
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            border: "none",
            borderRadius: "var(--r-md)",
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-12)",
            fontWeight: 600,
            cursor: searchSearching || !searchQuery.trim() ? "not-allowed" : "pointer",
            opacity: searchSearching || !searchQuery.trim() ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {searchSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Inline error */}
      {searchError && (
        <div
          style={{
            marginTop: 8,
            fontSize: "var(--text-12)",
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {searchError}
        </div>
      )}

      {/* Results list */}
      {searchResults.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {searchResults.map((paper) => {
            const added = searchAdded.has(paper.id);
            const truncatedTitle =
              paper.title.length > 80
                ? paper.title.slice(0, 80) + "…"
                : paper.title;
            const truncatedAbstract =
              paper.abstract.length > 120
                ? paper.abstract.slice(0, 120) + "…"
                : paper.abstract;
            const authorsDisplay =
              paper.authors.length > 0
                ? paper.authors.slice(0, 2).join(", ") +
                  (paper.authors.length > 2 ? " et al." : "")
                : "";

            return (
              <div
                key={paper.id}
                style={{
                  background: "var(--surface)",
                  border: "var(--hairline)",
                  borderRadius: "var(--r-md)",
                  padding: 12,
                }}
              >
                {/* Header row: title + Add/Added button */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-13)",
                      color: "var(--fg-strong)",
                      lineHeight: 1.4,
                      flex: 1,
                    }}
                  >
                    {truncatedTitle}
                  </span>
                  <button
                    onClick={() => !added && handleAddPaper(paper)}
                    disabled={added}
                    style={{
                      flexShrink: 0,
                      background: added
                        ? "var(--accent-08)"
                        : "var(--accent-10)",
                      color: added ? "var(--success)" : "var(--accent)",
                      border: added
                        ? "1px solid var(--success)"
                        : "1px solid var(--accent-25)",
                      borderRadius: "var(--r-sm)",
                      padding: "2px 8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-10)",
                      cursor: added ? "default" : "pointer",
                    }}
                  >
                    {added ? "Added" : "Add"}
                  </button>
                </div>

                {/* Meta row: badge + year + citations */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {renderSourceBadge(paper.source_api)}
                  {authorsDisplay && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-10)",
                        color: "var(--fg-faint)",
                      }}
                    >
                      {authorsDisplay}
                    </span>
                  )}
                  {paper.year && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-10)",
                        color: "var(--fg-faint)",
                      }}
                    >
                      {paper.year}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-10)",
                      color: "var(--fg-faint)",
                    }}
                  >
                    {paper.citationCount} citations
                  </span>
                </div>

                {/* TL;DR */}
                {truncatedAbstract && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: "var(--text-12)",
                      color: "var(--fg-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {truncatedAbstract}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state after search */}
      {!searchSearching && searchResults.length === 0 && searchQuery && !searchError && (
        <div
          style={{
            marginTop: 12,
            fontSize: "var(--text-13)",
            color: "var(--fg-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          No results. Try a different query.
        </div>
      )}
    </div>
  );

  const renderPasteDoiTab = () => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Label */}
      <div
        style={{
          fontSize: "var(--text-12)",
          color: "var(--fg-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Paste a DOI, arXiv ID, or paper URL
      </div>

      {/* Input + Resolve row */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          type="text"
          value={doiInput}
          onChange={(e) => setDoiInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !doiResolving) handleResolve();
          }}
          disabled={doiResolving}
          placeholder="10.1145/3290605.3300469 or arxiv:1706.03762"
          style={{
            flex: 1,
            background: "var(--surface)",
            border: "var(--hairline)",
            borderRadius: "var(--r-md)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-13)",
            color: "var(--fg-strong)",
            outline: "none",
            opacity: doiResolving ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleResolve}
          disabled={doiResolving || !doiInput.trim()}
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            border: "none",
            borderRadius: "var(--r-md)",
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-12)",
            fontWeight: 600,
            cursor: doiResolving || !doiInput.trim() ? "not-allowed" : "pointer",
            opacity: doiResolving || !doiInput.trim() ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {doiResolving ? "Resolving..." : "Resolve"}
        </button>
      </div>

      {/* Error */}
      {doiError && (
        <div
          style={{
            marginTop: 8,
            fontSize: "var(--text-12)",
            color: "var(--danger)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {doiError}
        </div>
      )}

      {/* Preview card */}
      {doiResolved && (
        <div
          style={{
            marginTop: 12,
            background: "var(--surface)",
            border: "var(--hairline)",
            borderRadius: "var(--r-md)",
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: "var(--text-14)",
              color: "var(--fg-strong)",
              lineHeight: 1.4,
            }}
          >
            {doiResolved.title}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-11)",
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {doiResolved.authors.slice(0, 2).join(", ")}
              {doiResolved.authors.length > 2 ? " et al." : ""}
              {doiResolved.year ? ` · ${doiResolved.year}` : ""}
            </span>
            {renderSourceBadge(doiResolved.source_api)}
          </div>
          {doiResolved.abstract && (
            <div
              style={{
                marginTop: 6,
                fontSize: "var(--text-12)",
                color: "var(--fg-muted)",
                lineHeight: 1.5,
              }}
            >
              {doiResolved.abstract.length > 150
                ? doiResolved.abstract.slice(0, 150) + "…"
                : doiResolved.abstract}
            </div>
          )}
          <button
            onClick={() => {
              handleAddPaper(doiResolved);
              setDoiResolved(null);
              setDoiInput("");
            }}
            style={{
              marginTop: 10,
              background: "var(--accent-10)",
              color: "var(--accent)",
              border: "1px solid var(--accent-25)",
              borderRadius: "var(--r-sm)",
              padding: "4px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-11)",
              cursor: "pointer",
            }}
          >
            Add to queue
          </button>
        </div>
      )}
    </div>
  );

  const renderUploadPdfTab = () => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setUploadDragOver(true);
        }}
        onDragLeave={() => setUploadDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUploadDragOver(false);
          const pdfs = Array.from(e.dataTransfer.files).filter(
            (f) =>
              f.name.toLowerCase().endsWith(".pdf") ||
              f.type === "application/pdf"
          );
          if (pdfs.length) setUploadQueue((prev) => [...prev, ...pdfs]);
        }}
        onClick={() => pdfInputRef.current?.click()}
        style={{
          border: uploadDragOver
            ? "1.5px solid var(--success)"
            : "1.5px dashed var(--type-entity)",
          borderRadius: "var(--r-lg)",
          padding: 24,
          textAlign: "center",
          cursor: "pointer",
          background: uploadDragOver ? "var(--accent-05)" : "transparent",
          transition: "all 0.2s ease",
        }}
      >
        <input
          ref={pdfInputRef}
          type="file"
          multiple
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            const pdfs = files.filter((f) =>
              f.name.toLowerCase().endsWith(".pdf")
            );
            if (pdfs.length) setUploadQueue((prev) => [...prev, ...pdfs]);
            e.target.value = "";
          }}
        />
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-13)",
            color: "var(--fg-strong)",
          }}
        >
          Drop PDFs here
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-11)",
            color: "var(--fg-faint)",
            marginTop: 4,
          }}
        >
          or click to browse
        </div>
      </div>

      {/* Queued files list */}
      {uploadQueue.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {uploadQueue.map((file, i) => {
            const name =
              file.name.length > 50
                ? file.name.slice(0, 50) + "…"
                : file.name;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  background: "var(--surface)",
                  border: "var(--hairline)",
                  borderRadius: "var(--r-sm)",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-12)",
                    color: "var(--fg-strong)",
                    fontFamily: "var(--font-mono)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-11)",
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-mono)",
                    flexShrink: 0,
                  }}
                >
                  {formatFileSize(file.size)}
                </span>
                <button
                  onClick={() =>
                    setUploadQueue((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove ${file.name}`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fg-faint)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-13)",
                    lineHeight: 1,
                    padding: "0 2px",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderSourcesTab = () => {
    const sourcedPages = pages.filter((p) => p.type === "source");

    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-12)",
            color: "var(--fg-muted)",
            marginBottom: 12,
          }}
        >
          Already ingested
        </div>

        {sourcedPages.length === 0 ? (
          <div
            style={{
              fontSize: "var(--text-13)",
              color: "var(--fg-faint)",
            }}
          >
            No sources ingested yet. Use Auto-research or Search papers to get
            started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sourcedPages.map((page) => {
              const sourceId =
                page.sources[0] && page.sources[0].length > 60
                  ? page.sources[0].slice(0, 60) + "…"
                  : page.sources[0] ?? "";
              return (
                <div
                  key={page.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    paddingTop: 8,
                    paddingBottom: 8,
                    borderBottom: "var(--hairline)",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--text-13)",
                        color: "var(--fg-strong)",
                        lineHeight: 1.4,
                      }}
                    >
                      {page.title}
                    </div>
                    {sourceId && (
                      <div
                        style={{
                          fontSize: "var(--text-11)",
                          color: "var(--fg-faint)",
                          fontFamily: "var(--font-mono)",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sourceId}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-10)",
                      color: "var(--fg-faint)",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {page.links.length} links
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Portal render
  // ─────────────────────────────────────────────────────────────────────────────

  const modal = (
    <>
      {/* Pulse animation for searching/compiling states */}
      <style>{`
        @keyframes distill-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Backdrop + centering wrapper */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.6)",
        }}
      >
        {/* Modal panel */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Add sources"
          style={{
            background: "var(--surface)",
            border: "var(--hairline)",
            borderRadius: "var(--r-xl)",
            maxWidth: 672,
            width: "100%",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            margin: "0 16px",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 12px",
              borderBottom: "var(--hairline)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-15)",
                color: "var(--fg-strong)",
                fontWeight: 500,
              }}
            >
              Add sources
            </span>
            <button
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                color: "var(--fg-faint)",
                lineHeight: 1,
                padding: "2px 6px",
                borderRadius: "var(--r-sm)",
              }}
            >
              ×
            </button>
          </div>

          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              borderBottom: "var(--hairline)",
              flexShrink: 0,
              overflowX: "auto",
            }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    padding: "10px 16px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-11)",
                    color: isActive ? "var(--accent)" : "var(--fg-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--track-label)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--s-4)",
            }}
          >
            {activeTab === "auto-research" && renderAutoResearchTab()}
            {activeTab === "search-papers" && renderSearchPapersTab()}
            {activeTab === "paste-doi" && renderPasteDoiTab()}
            {activeTab === "upload-pdf" && renderUploadPdfTab()}
            {activeTab === "sources" && renderSourcesTab()}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: "var(--hairline)",
              padding: "10px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flexShrink: 0,
            }}
          >
            {compileError && (
              <div
                style={{
                  fontSize: "var(--text-12)",
                  color: "var(--danger)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {compileError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-12)",
                  color:
                    queuedPapers.length > 0
                      ? "var(--fg-muted)"
                      : "var(--fg-faint)",
                }}
              >
                {queuedPapers.length > 0
                  ? `${queuedPapers.length} paper${queuedPapers.length !== 1 ? "s" : ""} queued`
                  : "No papers queued"}
              </span>
              <button
                onClick={handleCompileQueued}
                disabled={queuedPapers.length === 0 || compiling}
                style={{
                  background:
                    queuedPapers.length > 0 && !compiling
                      ? "var(--accent)"
                      : "var(--border)",
                  color:
                    queuedPapers.length > 0 && !compiling
                      ? "var(--bg)"
                      : "var(--fg-faint)",
                  border: "none",
                  borderRadius: "var(--r-md)",
                  padding: "7px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-12)",
                  fontWeight: 600,
                  cursor:
                    queuedPapers.length === 0 || compiling
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {compiling ? "Adding..." : "Compile & add"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}

"use client";

import { useState, useEffect, useReducer, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Paper } from "@/components/shared/types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AddSourcesModalProps {
  open: boolean;
  brainId: string;
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

// ─── AddSourcesModal ──────────────────────────────────────────────────────────

export function AddSourcesModal({
  open,
  brainId,
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

  // ── Search papers tab state (Plan 03) ───────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Paper[]>([]);

  // ── Paste DOI tab state (Plan 03) ───────────────────────────────────────────
  const [doiInput, setDoiInput] = useState("");
  const [doiResolved, setDoiResolved] = useState<Paper | null>(null);

  // ── Upload PDF tab state (Plan 03) ──────────────────────────────────────────
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);

  // ── Shared queued papers for footer CTA (Plan 03 adds to this) ─────────────
  const [queuedPapers, setQueuedPapers] = useState<Paper[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const modalRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Focus trap + Escape ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    // Focus first focusable element
    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const focusFirst = () => {
      if (!modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
      if (focusable.length > 0) focusable[0].focus();
    };

    // Small rAF to ensure portal has mounted
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

  // ── SSR guard ──────────────────────────────────────────────────────────────
  if (typeof document === "undefined" || !open) return null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

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
              if (
                e.key === "Enter" &&
                autoTopic.trim() &&
                stage === "idle"
              ) {
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

        {/* Terminal log — shown once we leave idle */}
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

        {/* Selecting stage — no candidates */}
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

  const renderPlaceholderTab = (label: string) => (
    <div
      style={{
        padding: "var(--s-4)",
        color: "var(--fg-faint)",
        fontSize: "var(--text-13)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {label} — coming in next plan
    </div>
  );

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
            {activeTab === "search-papers" &&
              renderPlaceholderTab("Search papers")}
            {activeTab === "paste-doi" &&
              renderPlaceholderTab("Paste DOI/URL")}
            {activeTab === "upload-pdf" &&
              renderPlaceholderTab("Upload PDF")}
            {activeTab === "sources" && renderPlaceholderTab("Sources")}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: "var(--hairline)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-12)",
                color: "var(--fg-muted)",
              }}
            >
              {queuedPapers.length} paper{queuedPapers.length !== 1 ? "s" : ""} queued
            </span>
            <button
              disabled={queuedPapers.length === 0}
              style={{
                background: queuedPapers.length > 0 ? "var(--accent)" : "var(--border)",
                color: queuedPapers.length > 0 ? "var(--bg)" : "var(--fg-faint)",
                border: "none",
                borderRadius: "var(--r-md)",
                padding: "7px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-12)",
                fontWeight: 600,
                cursor: queuedPapers.length > 0 ? "pointer" : "not-allowed",
              }}
            >
              Compile &amp; add
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}

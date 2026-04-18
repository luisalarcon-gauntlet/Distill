"use client";

import type { BrainConfig, WikiPage, LogEntry, Screen } from "@/components/shared/types";

interface CourseSidebarProps {
  brain: BrainConfig;
  pages: WikiPage[];
  log: LogEntry[];
  activePage: string | null;
  activeTab: "pages" | "assignments" | "log";
  onTabChange: (tab: "pages" | "assignments" | "log") => void;
  onPageSelect: (id: string) => void;
  onOpenModal: () => void;
  onNavigate: (screen: Screen, brainId?: string) => void;
}

// Page type sort order
const PAGE_TYPE_ORDER: Record<string, number> = {
  overview: 0,
  concept: 1,
  entity: 2,
  source: 3,
  analysis: 4,
};

// Page type accent colors — consistent with PageView palette
const PAGE_TYPE_COLOR: Record<string, string> = {
  overview: "#c4a1ff",
  concept: "#90c4ff",
  entity: "#7ec99a",
  source: "#d4a855",
  analysis: "#d46a6a",
};

// Log action badge colors
const LOG_ACTION_COLOR: Record<string, string> = {
  init: "#7a7a8c",
  search: "#c4a1ff",
  compile: "#90c4ff",
  create: "#7ec99a",
  update: "#d4a855",
  ingest: "#7ec99a",
  lint: "#d4a855",
  query: "#c4a1ff",
  save: "#90c4ff",
};

const SIDEBAR_WIDTH = 280;

export function CourseSidebar({
  brain,
  pages,
  log,
  activePage,
  activeTab,
  onTabChange,
  onPageSelect,
  onOpenModal,
  onNavigate,
}: CourseSidebarProps) {
  const sortedPages = [...pages].sort((a, b) => {
    const orderA = PAGE_TYPE_ORDER[a.type] ?? 99;
    const orderB = PAGE_TYPE_ORDER[b.type] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });

  const reversedLog = [...log].reverse();

  const tabs = ["pages", "assignments", "log"] as const;

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        maxWidth: SIDEBAR_WIDTH,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
        background: "var(--sidebar-bg, #0d0d17)",
        borderRight: "1px solid #1e1e2e",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 14px 14px",
          borderBottom: "1px solid #1e1e2e",
        }}
      >
        <button
          onClick={() => onNavigate("dashboard")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 11,
            color: "#4a4a5c",
            padding: 0,
            marginBottom: 10,
            display: "block",
          }}
        >
          &larr; Dashboard
        </button>
        <div
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 15,
            color: "#e0dfe6",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 4,
          }}
          title={brain.name}
        >
          {brain.name}
        </div>
        <div
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 11,
            color: "#4a4a5c",
          }}
        >
          {pages.length} page{pages.length !== 1 ? "s" : ""}
          {brain.courseCode ? ` · ${brain.courseCode}` : ""}
          {brain.semester ? ` · ${brain.semester}` : ""}
        </div>
      </div>

      {/* Primary action: Add sources */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #1e1e2e",
        }}
      >
        <button
          onClick={onOpenModal}
          style={{
            width: "100%",
            background: "#c4a1ff",
            color: "#0a0a0f",
            border: "none",
            borderRadius: 6,
            padding: "7px 12px",
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          + Add sources
        </button>
      </div>

      {/* Secondary action: Review flashcards */}
      <div
        style={{
          padding: "8px 12px 10px",
          borderBottom: "1px solid #1e1e2e",
        }}
      >
        <button
          onClick={() => onNavigate("flashcards", brain.id)}
          style={{
            flex: 1,
            width: "100%",
            background: "rgba(144,196,255,0.1)",
            color: "#90c4ff",
            border: "1px solid rgba(144,196,255,0.2)",
            borderRadius: 6,
            padding: "6px 12px",
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          Review flashcards
        </button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #1e1e2e",
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #c4a1ff" : "2px solid transparent",
                padding: "9px 4px 7px",
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: 11,
                color: isActive ? "#c4a1ff" : "#4a4a5c",
                textTransform: "uppercase",
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Scrollable panel */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px",
        }}
      >
        {/* Pages tab */}
        {activeTab === "pages" && (
          <div>
            {sortedPages.length === 0 ? (
              <div
                style={{
                  padding: "16px 8px",
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 12,
                  color: "#4a4a5c",
                  textAlign: "center",
                }}
              >
                No pages yet. Add sources to compile.
              </div>
            ) : (
              sortedPages.map((page) => {
                const isActive = activePage === page.id;
                const typeColor = PAGE_TYPE_COLOR[page.type] || "#7a7a8c";
                return (
                  <button
                    key={page.id}
                    onClick={() => onPageSelect(page.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      background: isActive ? "rgba(196,161,255,0.08)" : "none",
                      border: "none",
                      borderLeft: isActive ? `2px solid #c4a1ff` : "2px solid transparent",
                      padding: "7px 8px 7px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      borderRadius: "0 4px 4px 0",
                      marginBottom: 1,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "IBM Plex Mono, monospace",
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: typeColor,
                        marginBottom: 2,
                      }}
                    >
                      {page.type}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: isActive ? "#e0dfe6" : "#b0afba",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {page.title}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Assignments tab — placeholder for Plan 04 */}
        {activeTab === "assignments" && (
          <div className="p-3" style={{ fontSize: 13, color: "#4a4a5c" }}>
            Assignment cross-reference coming soon
          </div>
        )}

        {/* Log tab */}
        {activeTab === "log" && (
          <div>
            {reversedLog.length === 0 ? (
              <div
                style={{
                  padding: "16px 8px",
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 12,
                  color: "#4a4a5c",
                  textAlign: "center",
                }}
              >
                No log entries yet.
              </div>
            ) : (
              reversedLog.map((entry, i) => {
                const actionColor = LOG_ACTION_COLOR[entry.action.toLowerCase()] || "#7a7a8c";
                const truncatedDetail =
                  entry.detail.length > 50
                    ? entry.detail.slice(0, 50) + "…"
                    : entry.detail;
                return (
                  <div
                    key={i}
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid #1a1a28",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "IBM Plex Mono, monospace",
                          fontSize: 10,
                          color: actionColor,
                          background: `${actionColor}18`,
                          padding: "1px 5px",
                          borderRadius: 3,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {entry.action}
                      </span>
                      <span
                        style={{
                          fontFamily: "IBM Plex Mono, monospace",
                          fontSize: 10,
                          color: "#4a4a5c",
                        }}
                      >
                        {entry.date}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#7a7a8c",
                        lineHeight: 1.4,
                      }}
                    >
                      {truncatedDetail}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

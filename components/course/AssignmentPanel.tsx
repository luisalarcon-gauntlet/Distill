"use client";

import type { WikiPage, ExamPrepSession } from "@/components/shared/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssignmentPanelProps {
  pages: WikiPage[];
  examSessions: ExamPrepSession[];
}

// ─── Keyword matching ─────────────────────────────────────────────────────────

function resolveRelatedPages(concepts: string[], pages: WikiPage[]): WikiPage[] {
  return concepts
    .flatMap((concept) =>
      pages.filter(
        (p) =>
          p.title.toLowerCase().includes(concept.toLowerCase()) ||
          concept.toLowerCase().includes(p.title.toLowerCase())
      )
    )
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i); // dedupe by id
}

// ─── Difficulty badge ─────────────────────────────────────────────────────────

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "var(--success)",
  medium: "var(--warn)",
  hard: "var(--danger)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentPanel({ pages, examSessions }: AssignmentPanelProps) {
  return (
    <div
      style={{
        maxWidth: 780,
        padding: "48px 48px 80px",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 15,
          color: "var(--fg-strong)",
          marginBottom: 16,
        }}
      >
        Assignments &amp; Cross-References
      </div>

      {/* Empty state */}
      {examSessions.length === 0 ? (
        <div
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 13,
            color: "var(--fg-muted)",
            textAlign: "center",
            padding: "40px 0",
          }}
        >
          No exam prep sessions yet. Create one from the course viewer to see
          question-to-reading links here.
        </div>
      ) : (
        examSessions.map((session) => (
          <div key={session.id} style={{ marginBottom: 32 }}>
            {/* Session heading */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 13,
                  color: "var(--accent)",
                  fontWeight: 600,
                }}
              >
                {session.title}
              </div>
              {session.examDate && (
                <div
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: 11,
                    color: "var(--fg-muted)",
                  }}
                >
                  {session.examDate}
                </div>
              )}
            </div>

            {/* Practice questions */}
            {session.practiceQuestions.length === 0 ? (
              <div
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: 12,
                  color: "var(--fg-faint)",
                  paddingLeft: 2,
                }}
              >
                No practice questions in this session.
              </div>
            ) : (
              session.practiceQuestions.map((q) => {
                const relatedPages = resolveRelatedPages(q.relatedConcepts, pages);
                const diffColor =
                  DIFFICULTY_COLOR[q.difficulty] || "var(--fg-muted)";

                return (
                  <div
                    key={q.id}
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      borderRadius: 6,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {/* Difficulty badge */}
                    <div style={{ marginBottom: 6 }}>
                      <span
                        style={{
                          fontFamily: "IBM Plex Mono, monospace",
                          fontSize: 9,
                          color: diffColor,
                          background: `color-mix(in srgb, ${diffColor} 15%, transparent)`,
                          padding: "2px 6px",
                          borderRadius: 3,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    {/* Question text */}
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg-strong)",
                        lineHeight: 1.5,
                        marginBottom: 8,
                      }}
                    >
                      {q.question}
                    </div>

                    {/* Related readings */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      {relatedPages.length === 0 ? (
                        <span
                          style={{
                            fontFamily: "IBM Plex Mono, monospace",
                            fontSize: 10,
                            color: "var(--fg-muted)",
                          }}
                        >
                          No linked pages found
                        </span>
                      ) : (
                        relatedPages.map((page) => (
                          <span
                            key={page.id}
                            style={{
                              fontFamily: "IBM Plex Mono, monospace",
                              fontSize: 11,
                              color: "var(--link)",
                              background: "var(--surface)",
                              padding: "4px 10px",
                              borderRadius: 4,
                              cursor: "default",
                            }}
                          >
                            {page.title}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ))
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import type { BrainConfig, WikiPage, LogEntry, Screen } from "@/components/shared/types";
import { PageView } from "@/components/shared/PageView";
import { CourseSidebar } from "@/components/course/CourseSidebar";

interface CourseViewerProps {
  brainId: string;
  onNavigate: (screen: Screen, brainId?: string) => void;
  onOpenModal: () => void;
}

export function CourseViewer({ brainId, onNavigate, onOpenModal }: CourseViewerProps) {
  const [brain, setBrain] = useState<BrainConfig | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"pages" | "assignments" | "log">("pages");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brainId) return;
    setLoading(true);
    fetch(`/api/brains/${brainId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBrain(data.brain);
        setPages(data.pages || []);
        setLog(data.log || []);
        const overview = (data.pages || []).find((p: WikiPage) => p.type === "overview");
        setActivePage(overview?.id || data.pages?.[0]?.id || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [brainId]);

  // Wiki link navigation — exact ID, slug, or fuzzy title match
  const handleNavigate = useCallback(
    (target: string) => {
      if (!pages.length) return;
      const exact = pages.find((p) => p.id === target);
      if (exact) {
        setActivePage(target);
        return;
      }
      const slug = target
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const bySlug = pages.find((p) => p.id === slug);
      if (bySlug) {
        setActivePage(bySlug.id);
        return;
      }
      const fuzzy = pages.find((p) =>
        p.title.toLowerCase().includes(target.toLowerCase())
      );
      if (fuzzy) setActivePage(fuzzy.id);
    },
    [pages]
  );

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 13,
          color: "#4a4a5c",
        }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 13,
            color: "#d46a6a",
          }}
        >
          {error}
        </div>
        <button
          onClick={() => setError(null)}
          style={{
            background: "none",
            border: "1px solid #2a2a3e",
            borderRadius: 6,
            padding: "5px 14px",
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 11,
            color: "#4a4a5c",
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!brain) {
    return null;
  }

  const currentPage = pages.find((p) => p.id === activePage) || null;

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <CourseSidebar
        brain={brain}
        pages={pages}
        log={log}
        activePage={activePage}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        onPageSelect={setActivePage}
        onOpenModal={onOpenModal}
        onNavigate={onNavigate}
      />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {sidebarTab === "assignments" ? (
          // Assignments panel placeholder — wired in Plan 04
          <div
            style={{
              maxWidth: 780,
              padding: "48px 48px 80px",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 13,
              color: "#4a4a5c",
            }}
          >
            Assignment cross-reference coming soon.
          </div>
        ) : currentPage ? (
          <div style={{ maxWidth: 780, padding: "48px 48px 80px" }}>
            <PageView page={currentPage} onNavigate={handleNavigate} />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 13,
              color: "#4a4a5c",
              textAlign: "center",
            }}
          >
            No pages compiled yet. Add sources to get started.
          </div>
        )}
      </div>
    </div>
  );
}

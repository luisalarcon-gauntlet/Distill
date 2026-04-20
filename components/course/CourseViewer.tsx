"use client";

import { useState, useEffect, useCallback } from "react";
import type { BrainConfig, WikiPage, LogEntry, Screen, ExamPrepSession } from "@/components/shared/types";
import { PageView } from "@/components/shared/PageView";
import { CourseSidebar } from "@/components/course/CourseSidebar";
import { AddSourcesModal } from "@/components/course/AddSourcesModal";
import { AssignmentPanel } from "@/components/course/AssignmentPanel";

interface CourseViewerProps {
  brainId: string;
  onNavigate: (screen: Screen, brainId?: string) => void;
}

export function CourseViewer({ brainId, onNavigate }: CourseViewerProps) {
  const [brain, setBrain] = useState<BrainConfig | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"pages" | "assignments" | "log">("pages");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [examSessions, setExamSessions] = useState<ExamPrepSession[]>([]);

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

        // Load exam sessions — non-fatal if endpoint not yet implemented
        fetch(`/api/brains/${brainId}/exam-prep`)
          .then((r) => r.json())
          .then((epData) => {
            if (!epData.error) {
              setExamSessions(Array.isArray(epData) ? epData : []);
            }
          })
          .catch(() => {
            // Non-fatal: exam-prep endpoint may not exist yet
          });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [brainId]);

  // Reload brain data after ingest completes
  const reloadBrain = useCallback(async () => {
    const res = await fetch(`/api/brains/${brainId}`);
    const data = await res.json();
    if (!data.error) {
      setPages(data.pages || []);
      setLog(data.log || []);
    }
  }, [brainId]);

  // Flashcard generation
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const handleGenerateFlashcards = useCallback(async () => {
    if (!brainId) return;
    setGeneratingFlashcards(true);
    try {
      await fetch(`/api/brains/${brainId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 30 }),
      });
    } catch {
      // non-fatal
    } finally {
      setGeneratingFlashcards(false);
    }
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
          color: "var(--fg-muted)",
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
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
        <button
          onClick={() => setError(null)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 14px",
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 11,
            color: "var(--fg-muted)",
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
        onOpenModal={() => setModalOpen(true)}
        onNavigate={onNavigate}
        onGenerateFlashcards={handleGenerateFlashcards}
        generatingFlashcards={generatingFlashcards}
      />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {sidebarTab === "assignments" ? (
          <AssignmentPanel pages={pages} examSessions={examSessions} />
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
              color: "var(--fg-muted)",
              textAlign: "center",
            }}
          >
            No pages compiled yet. Add sources to get started.
          </div>
        )}
      </div>

      {/* Add Sources Modal — portal renders to document.body */}
      <AddSourcesModal
        open={modalOpen}
        brainId={brainId}
        pages={pages}
        onClose={() => setModalOpen(false)}
        onIngestComplete={reloadBrain}
      />
    </div>
  );
}

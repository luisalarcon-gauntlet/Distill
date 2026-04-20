"use client";

import { useEffect, useState } from "react";
import { BrainConfig, Screen, WikiPage } from "@/components/shared/types";
import { CourseCard, NewCourseCard } from "@/components/dashboard/CourseCard";
import { WeekAheadSidebar } from "@/components/dashboard/WeekAheadSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Icon } from "@/components/shared/Icon";

interface DashboardScreenProps {
  onNavigate: (screen: Screen, brainId?: string) => void;
}

export function DashboardScreen({ onNavigate }: DashboardScreenProps) {
  const [brains, setBrains] = useState<BrainConfig[]>([]);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/brains");
        if (!res.ok) throw new Error(`Failed to load brains: ${res.status}`);
        const data: { brains: BrainConfig[] } = await res.json();
        setBrains(data.brains);

        // Fetch page counts concurrently — T-02-06: wrap in try/catch, default to 0 on error
        try {
          const counts = await Promise.all(
            data.brains.map(async (brain) => {
              try {
                const r = await fetch(`/api/brains/${brain.id}`);
                if (!r.ok) return { id: brain.id, count: 0 };
                const bd: { pages: WikiPage[] } = await r.json();
                return { id: brain.id, count: Array.isArray(bd.pages) ? bd.pages.length : 0 };
              } catch {
                return { id: brain.id, count: 0 };
              }
            })
          );
          const countsMap: Record<string, number> = {};
          counts.forEach(({ id, count }) => {
            countsMap[id] = count;
          });
          setPageCounts(countsMap);
        } catch {
          // T-02-06: network failure — leave all page counts at 0
          setPageCounts({});
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not load courses. Check your setup.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const totalPages = brains.reduce((sum, b) => sum + (pageCounts[b.id] ?? 0), 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {/* Left cluster */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-10)",
            color: "var(--fg-faint)",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          DISTILL
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "18px",
            color: "var(--fg-strong)",
            marginLeft: "12px",
          }}
        >
          This term
        </span>

        {/* Middle: summary stats */}
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-12)",
            color: "var(--fg-muted)",
            marginLeft: "16px",
            flex: 1,
          }}
        >
          {loading ? "\u00a0" : `${brains.length} ${brains.length === 1 ? "course" : "courses"} · ${totalPages} compiled ${totalPages === 1 ? "page" : "pages"}`}
        </span>

        {/* Right cluster */}
        <button
          onClick={() => onNavigate("import")}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-11)",
            color: "var(--accent)",
            background: "var(--accent-10)",
            border: "none",
            borderRadius: "var(--r-md)",
            padding: "6px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Icon name="upload" size={14} />
          Import syllabus
        </button>
        <ThemeToggle />
      </header>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left pane: course cards grid */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
          }}
        >
          {loading && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-13)", color: "var(--fg-faint)" }}>
              Loading courses
            </p>
          )}
          {error && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-13)", color: "var(--danger)" }}>
              {error}
            </p>
          )}
          {!loading && !error && brains.length === 0 && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-13)",
                color: "var(--fg-faint)",
                textAlign: "center",
                marginTop: "48px",
              }}
            >
              No courses yet. Import a syllabus to get started.
            </p>
          )}
          {!loading && !error && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "10px",
              }}
            >
              {brains.map((brain, i) => (
                <CourseCard
                  key={brain.id}
                  brain={brain}
                  pageCount={pageCounts[brain.id] ?? 0}
                  index={i}
                  onClick={() => onNavigate("course", brain.id)}
                  onRemove={async () => {
                    try {
                      await fetch(`/api/brains/${brain.id}`, { method: "DELETE" });
                      setBrains((prev) => prev.filter((b) => b.id !== brain.id));
                    } catch { /* non-fatal */ }
                  }}
                />
              ))}
              <NewCourseCard onClick={() => onNavigate("import")} />
            </div>
          )}
        </main>

        {/* Right pane: Week Ahead sidebar */}
        <aside
          style={{
            width: "340px",
            borderLeft: "1px solid var(--border)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <WeekAheadSidebar brains={brains} />
        </aside>
      </div>
    </div>
  );
}

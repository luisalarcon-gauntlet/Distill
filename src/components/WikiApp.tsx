"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───
interface WikiPage {
  id: string;
  title: string;
  type: string;
  content: string;
  links: string[];
  source_count: number;
  updated_at: string;
}

interface LogEntry {
  action: string;
  detail: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  topic: string;
  created_at: string;
}

type Screen = "home" | "loading" | "wiki";

// ─── Graph Component ───
function WikiGraph({
  pages,
  activePage,
  onNavigate,
}: {
  pages: WikiPage[];
  activePage: string | null;
  onNavigate: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Record<string, { x: number; y: number; vx: number; vy: number }>>({});
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = (canvas.height = canvas.offsetHeight * 2);
    ctx.scale(2, 2);
    const w = W / 2,
      h = H / 2,
      cx = w / 2,
      cy = h / 2;

    pages.forEach((p, i) => {
      if (!nodesRef.current[p.id]) {
        const a = (i / pages.length) * Math.PI * 2;
        const r = Math.min(w, h) * 0.3;
        nodesRef.current[p.id] = {
          x: cx + Math.cos(a) * r + (Math.random() - 0.5) * 40,
          y: cy + Math.sin(a) * r + (Math.random() - 0.5) * 40,
          vx: 0,
          vy: 0,
        };
      }
    });

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current;

      pages.forEach((p) => {
        const n = nodes[p.id];
        if (!n) return;
        n.vx += (cx - n.x) * 0.001;
        n.vy += (cy - n.y) * 0.001;
        pages.forEach((q) => {
          if (p.id === q.id) return;
          const m = nodes[q.id];
          if (!m) return;
          const dx = n.x - m.x,
            dy = n.y - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 120) {
            const f = (120 - dist) * 0.02;
            n.vx += (dx / dist) * f;
            n.vy += (dy / dist) * f;
          }
        });
        (p.links || []).forEach((lid) => {
          const m = nodes[lid];
          if (!m) return;
          n.vx += (m.x - n.x) * 0.003;
          n.vy += (m.y - n.y) * 0.003;
        });
        n.vx *= 0.9;
        n.vy *= 0.9;
        n.x = Math.max(40, Math.min(w - 40, n.x + n.vx));
        n.y = Math.max(40, Math.min(h - 40, n.y + n.vy));
      });

      // Edges
      pages.forEach((p) => {
        const n = nodes[p.id];
        (p.links || []).forEach((lid) => {
          const m = nodes[lid];
          if (!n || !m) return;
          const active = p.id === activePage || lid === activePage;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.strokeStyle = active ? "rgba(196,161,255,0.25)" : "rgba(122,122,140,0.1)";
          ctx.lineWidth = active ? 1.5 : 0.5;
          ctx.stroke();
        });
      });

      // Nodes
      const typeColor: Record<string, string> = {
        overview: "#c4a1ff",
        concept: "#90c4ff",
        entity: "#7ec99a",
        source: "#d4a855",
        analysis: "#d46a6a",
      };
      pages.forEach((p) => {
        const n = nodes[p.id];
        if (!n) return;
        const isActive = p.id === activePage;
        const r = isActive ? 7 : p.type === "overview" ? 6 : 4;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? "#c4a1ff" : typeColor[p.type] || "#7a7a8c";
        ctx.fill();
        if (isActive) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(196,161,255,0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.font = `${isActive ? 11 : 9}px 'IBM Plex Mono', monospace`;
        ctx.fillStyle = isActive ? "#e0dfe6" : "#4a4a5c";
        ctx.textAlign = "center";
        const label = p.title.length > 22 ? p.title.slice(0, 20) + "…" : p.title;
        ctx.fillText(label, n.x, n.y + r + 14);
      });

      animRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [pages, activePage]);

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    for (const p of pages) {
      const n = nodesRef.current[p.id];
      if (!n) continue;
      if (Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < 16) {
        onNavigate(p.id);
        break;
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full cursor-pointer rounded-lg"
      style={{ height: 240, background: "rgba(255,255,255,0.01)" }}
    />
  );
}

// ─── Page Renderer ───
function PageView({ page, onNavigate }: { page: WikiPage; onNavigate: (t: string) => void }) {
  const typeColor: Record<string, string> = {
    overview: "#c4a1ff",
    concept: "#90c4ff",
    entity: "#7ec99a",
    source: "#d4a855",
    analysis: "#d46a6a",
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(\[\[.*?\]\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[\[(.*?)\]\]$/);
      if (m)
        return (
          <span
            key={i}
            onClick={() => onNavigate(m[1])}
            className="cursor-pointer"
            style={{ color: "#90c4ff", borderBottom: "1px solid rgba(144,196,255,0.2)", fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}
          >
            {m[1]}
          </span>
        );

      return part.split("\n").map((line, j) => {
        const key = `${i}-${j}`;
        if (line.startsWith("## "))
          return (
            <h3 key={key} className="mt-6 mb-2 font-semibold" style={{ fontFamily: "IBM Plex Mono", fontSize: 15, color: "#e0dfe6" }}>
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("- "))
          return (
            <div key={key} className="pl-4 my-1" style={{ fontSize: 14, lineHeight: 1.6 }}>
              <span style={{ color: "#4a4a5c", marginRight: 8 }}>›</span>
              {renderInline(line.slice(2))}
            </div>
          );
        if (line.startsWith("|"))
          return (
            <div key={key} style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#7a7a8c", lineHeight: 1.8 }}>
              {line}
            </div>
          );
        if (line.startsWith("→"))
          return (
            <div key={key} className="mt-3" style={{ fontSize: 13, color: "#4a4a5c", fontFamily: "IBM Plex Mono" }}>
              {line}
            </div>
          );
        if (line.startsWith("`") && line.endsWith("`"))
          return (
            <div
              key={key}
              className="my-2 px-3 py-2 rounded-md"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 12, background: "rgba(196,161,255,0.06)", color: "#c4a1ff", border: "1px solid #1e1e2e" }}
            >
              {line.slice(1, -1)}
            </div>
          );
        if (line.trim() === "") return <div key={key} className="h-2" />;
        return (
          <p key={key} className="my-1.5" style={{ fontSize: 14, lineHeight: 1.7 }}>
            {renderInline(line)}
          </p>
        );
      });
    });
  };

  const renderInline = (text: string) =>
    text.split(/(\*\*.*?\*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="font-semibold" style={{ color: "#e0dfe6" }}>
          {p.slice(2, -2)}
        </strong>
      ) : (
        p
      )
    );

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-5">
        <span
          className="uppercase text-[10px] tracking-widest px-2 py-0.5 rounded"
          style={{ color: typeColor[page.type] || "#7a7a8c", background: `${typeColor[page.type] || "#7a7a8c"}15`, fontFamily: "IBM Plex Mono" }}
        >
          {page.type}
        </span>
        <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c" }}>
          {page.source_count} sources
        </span>
      </div>
      <h2 className="mb-5 font-semibold" style={{ fontFamily: "IBM Plex Mono", fontSize: 22, lineHeight: 1.3, color: "#e0dfe6" }}>
        {page.title}
      </h2>
      <div>{renderContent(page.content)}</div>
      {page.links?.length > 0 && (
        <div className="mt-7 pt-4" style={{ borderTop: "1px solid #1e1e2e" }}>
          <div className="mb-2 uppercase tracking-widest" style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#4a4a5c" }}>
            Linked Pages
          </div>
          <div className="flex flex-wrap gap-1.5">
            {page.links.map((l) => (
              <span
                key={l}
                onClick={() => onNavigate(l)}
                className="cursor-pointer px-2.5 py-1 rounded"
                style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#90c4ff", background: "#2a2a3e" }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ───
export default function WikiApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [topic, setTopic] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"pages" | "graph" | "log">("pages");
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ingestQuery, setIngestQuery] = useState("");
  const [ingesting, setIngesting] = useState(false);

  // Load existing projects on mount
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    if (data.pages) {
      setProjectId(id);
      setPages(data.pages);
      setLog(data.log || []);
      const overview = data.pages.find((p: WikiPage) => p.type === "overview");
      setActivePage(overview?.id || data.pages[0]?.id || null);
      setScreen("wiki");
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) return;
    setScreen("loading");
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadProject(data.projectId);
    } catch (e: any) {
      setError(e.message);
      setScreen("home");
    }
  }, [topic, loadProject]);

  const handleIngest = useCallback(async () => {
    if (!ingestQuery.trim() || !projectId) return;
    setIngesting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ingestQuery }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadProject(projectId);
      setIngestQuery("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIngesting(false);
    }
  }, [ingestQuery, projectId, loadProject]);

  const handleNavigate = useCallback(
    (target: string) => {
      if (!pages.length) return;
      const exact = pages.find((p) => p.id === target);
      if (exact) { setActivePage(target); return; }
      const slug = target.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const bySlug = pages.find((p) => p.id === slug);
      if (bySlug) { setActivePage(bySlug.id); return; }
      const fuzzy = pages.find((p) => p.title.toLowerCase().includes(target.toLowerCase()));
      if (fuzzy) setActivePage(fuzzy.id);
    },
    [pages]
  );

  // ─── HOME ───
  if (screen === "home") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-xl w-full">
          <div className="mb-12">
            <div className="uppercase tracking-[0.15em] mb-3" style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#8b6fc0" }}>
              Distill
            </div>
            <h1 className="font-semibold leading-tight" style={{ fontFamily: "IBM Plex Mono", fontSize: 36, color: "#e0dfe6" }}>
              Turn any research topic into a living knowledge wiki
            </h1>
            <p className="mt-4" style={{ fontSize: 15, color: "#7a7a8c", lineHeight: 1.6 }}>
              Enter a topic. Distill pulls papers from Semantic Scholar and compiles them into an interlinked, browsable wiki — concepts, entities, sources, all cross-referenced. BYO API key (Claude or OpenAI).
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(212,106,106,0.1)", color: "#d46a6a", border: "1px solid rgba(212,106,106,0.2)" }}>
              {error}
            </div>
          )}

          <div className="relative">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="e.g. transformer architecture, CRISPR, dark matter..."
              className="w-full outline-none"
              style={{
                padding: "16px 120px 16px 20px", fontSize: 15, color: "#e0dfe6",
                background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 10,
              }}
            />
            <button
              onClick={handleGenerate}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-5"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 13, fontWeight: 500, background: "#c4a1ff", color: "#0a0a0f", borderRadius: 7, border: "none", cursor: "pointer" }}
            >
              Compile →
            </button>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {["Transformer Architecture", "CRISPR Gene Editing", "Reinforcement Learning"].map((s) => (
              <button
                key={s}
                onClick={() => setTopic(s)}
                className="px-3 py-1.5 rounded-md"
                style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c", background: "#2a2a3e", border: "1px solid #1e1e2e", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>

          {projects.length > 0 && (
            <div className="mt-10 pt-6" style={{ borderTop: "1px solid #1e1e2e" }}>
              <div className="uppercase tracking-widest mb-3" style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#4a4a5c" }}>
                Previous Wikis
              </div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadProject(p.id)}
                  className="block w-full text-left px-3 py-2.5 rounded-md mb-1"
                  style={{ color: "#7a7a8c", fontSize: 14, background: "transparent", border: "none", cursor: "pointer" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#12121a")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {p.name}
                  <span className="ml-2" style={{ fontSize: 11, color: "#4a4a5c" }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── LOADING ───
  if (screen === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center gap-1.5 mb-8">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: "#c4a1ff", animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
          <p style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: "#7a7a8c" }}>
            Compiling wiki for &quot;{topic}&quot;...
          </p>
          <style>{`@keyframes pulse { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }`}</style>
        </div>
      </div>
    );
  }

  // ─── WIKI ───
  const currentPage = pages.find((p) => p.id === activePage) || null;
  const typeOrder: Record<string, number> = { overview: 0, concept: 1, entity: 2, source: 3, analysis: 4 };
  const sortedPages = [...pages].sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="flex flex-col" style={{ width: 280, minWidth: 280, borderRight: "1px solid #1e1e2e", height: "100vh", position: "sticky", top: 0 }}>
        <div className="p-4 pb-3" style={{ borderBottom: "1px solid #1e1e2e" }}>
          <button
            onClick={() => { setScreen("home"); setProjectId(null); setPages([]); }}
            className="mb-1 uppercase tracking-[0.15em]"
            style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#8b6fc0", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            ← Distill
          </button>
          <div className="font-semibold" style={{ fontFamily: "IBM Plex Mono", fontSize: 15, color: "#e0dfe6" }}>
            {topic}
          </div>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c" }}>
            {pages.length} pages
          </div>
        </div>

        {/* Ingest bar */}
        <div className="p-3" style={{ borderBottom: "1px solid #1e1e2e" }}>
          <div className="flex gap-1.5">
            <input
              value={ingestQuery}
              onChange={(e) => setIngestQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleIngest()}
              placeholder="Add a paper..."
              className="flex-1 outline-none px-2.5 py-1.5 rounded"
              style={{ fontSize: 12, color: "#e0dfe6", background: "#1a1a26", border: "1px solid #1e1e2e" }}
              disabled={ingesting}
            />
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="px-2.5 py-1.5 rounded"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#0a0a0f", background: ingesting ? "#4a4a5c" : "#c4a1ff", border: "none", cursor: "pointer" }}
            >
              {ingesting ? "..." : "+"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid #1e1e2e" }}>
          {(["pages", "graph", "log"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className="flex-1 py-2.5 uppercase tracking-wider"
              style={{
                fontFamily: "IBM Plex Mono", fontSize: 11,
                color: sidebarTab === tab ? "#c4a1ff" : "#4a4a5c",
                background: "none", border: "none",
                borderBottom: sidebarTab === tab ? "2px solid #c4a1ff" : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sidebarTab === "pages" &&
            sortedPages.map((p) => {
              const typeColor: Record<string, string> = { overview: "#c4a1ff", concept: "#90c4ff", entity: "#7ec99a", source: "#d4a855" };
              return (
                <div
                  key={p.id}
                  onClick={() => setActivePage(p.id)}
                  className="px-3 py-2.5 rounded-md cursor-pointer mb-0.5"
                  style={{
                    background: activePage === p.id ? "rgba(196,161,255,0.08)" : "transparent",
                    borderLeft: `2px solid ${activePage === p.id ? "#c4a1ff" : "transparent"}`,
                  }}
                >
                  <div style={{ fontSize: 13, color: activePage === p.id ? "#e0dfe6" : "#7a7a8c", fontWeight: activePage === p.id ? 500 : 400 }}>
                    {p.title.length > 30 ? p.title.slice(0, 28) + "…" : p.title}
                  </div>
                  <span className="uppercase tracking-wider" style={{ fontFamily: "IBM Plex Mono", fontSize: 9, color: typeColor[p.type] || "#4a4a5c" }}>
                    {p.type}
                  </span>
                </div>
              );
            })}

          {sidebarTab === "graph" && <WikiGraph pages={pages} activePage={activePage} onNavigate={setActivePage} />}

          {sidebarTab === "log" &&
            log.map((entry, i) => {
              const ac: Record<string, string> = { ingest: "#7ec99a", compile: "#90c4ff", lint: "#d4a855", search: "#c4a1ff", complete: "#c4a1ff" };
              return (
                <div key={i} className="py-2" style={{ borderBottom: "1px solid #1e1e2e" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="uppercase" style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: ac[entry.action] || "#4a4a5c" }}>
                      {entry.action}
                    </span>
                    <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#4a4a5c" }}>
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-0.5" style={{ fontSize: 12, color: "#7a7a8c" }}>
                    {entry.detail.length > 50 ? entry.detail.slice(0, 48) + "…" : entry.detail}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-12 py-8 overflow-y-auto" style={{ maxWidth: 720 }}>
        {currentPage ? (
          <PageView page={currentPage} onNavigate={handleNavigate} />
        ) : (
          <div className="text-center py-20" style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: "#4a4a5c" }}>
            Select a page from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}

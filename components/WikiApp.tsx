"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───
interface BrainConfig {
  id: string;
  name: string;
  path: string;
  topic: string;
  created: string;
  lastOpened: string;
}

interface WikiPage {
  id: string;
  title: string;
  type: string;
  content: string;
  links: string[];
  sources: string[];
  filepath: string;
  created: string;
  updated: string;
}

interface LogEntry {
  date: string;
  action: string;
  detail: string;
}

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  citationCount: number;
  source_api: "semantic_scholar" | "arxiv" | "openalex";
  arxivId?: string;
}

type TokenOperation = "compile" | "ingest" | "query" | "lint";

interface OperationBreakdown {
  input: number;
  output: number;
  count: number;
}

interface TokenSummary {
  total_input: number;
  total_output: number;
  total_tokens: number;
  by_operation: Record<TokenOperation, OperationBreakdown>;
  estimated_cost_usd: number;
  estimated_tokens_without_wiki: number;
  tokens_saved: number;
  model: string;
  provider: string;
}

type Screen = "brains" | "create" | "review" | "loading" | "wiki";

// ─── Source badges ───
const SOURCE_LABELS: Record<Paper["source_api"], string> = {
  semantic_scholar: "S2",
  arxiv: "arXiv",
  openalex: "OpenAlex",
};

const SOURCE_COLORS: Record<Paper["source_api"], { fg: string; bg: string }> = {
  semantic_scholar: { fg: "#90c4ff", bg: "rgba(144,196,255,0.12)" },
  arxiv: { fg: "#d4a855", bg: "rgba(212,168,85,0.12)" },
  openalex: { fg: "#7ec99a", bg: "rgba(126,201,154,0.12)" },
};

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function SourceBadge({ source }: { source: Paper["source_api"] }) {
  const c = SOURCE_COLORS[source];
  return (
    <span
      className="uppercase tracking-wider"
      style={{
        fontFamily: "IBM Plex Mono",
        fontSize: 9,
        padding: "2px 6px",
        borderRadius: 4,
        color: c.fg,
        background: c.bg,
        whiteSpace: "nowrap",
      }}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}

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
        const label = p.title.length > 22 ? p.title.slice(0, 20) + "..." : p.title;
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
function PageView({
  page,
  onNavigate,
}: {
  page: WikiPage;
  onNavigate: (t: string) => void;
}) {
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
            style={{
              color: "#90c4ff",
              borderBottom: "1px solid rgba(144,196,255,0.2)",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 13,
            }}
          >
            {m[1]}
          </span>
        );

      return part.split("\n").map((line, j) => {
        const key = `${i}-${j}`;
        if (line.startsWith("## "))
          return (
            <h3
              key={key}
              className="mt-6 mb-2 font-semibold"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 15, color: "#e0dfe6" }}
            >
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("- "))
          return (
            <div key={key} className="pl-4 my-1" style={{ fontSize: 14, lineHeight: 1.6 }}>
              <span style={{ color: "#4a4a5c", marginRight: 8 }}>&#8250;</span>
              {renderInline(line.slice(2))}
            </div>
          );
        if (line.startsWith("|"))
          return (
            <div
              key={key}
              style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#7a7a8c", lineHeight: 1.8 }}
            >
              {line}
            </div>
          );
        if (line.startsWith("```") || line.endsWith("```")) return null;
        if (line.startsWith("`") && line.endsWith("`"))
          return (
            <div
              key={key}
              className="my-2 px-3 py-2 rounded-md"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 12,
                background: "rgba(196,161,255,0.06)",
                color: "#c4a1ff",
                border: "1px solid #1e1e2e",
              }}
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
      <div className="flex items-center gap-2.5 mb-1">
        <span
          className="uppercase text-[10px] tracking-widest px-2 py-0.5 rounded"
          style={{
            color: typeColor[page.type] || "#7a7a8c",
            background: `${typeColor[page.type] || "#7a7a8c"}15`,
            fontFamily: "IBM Plex Mono",
          }}
        >
          {page.type}
        </span>
        <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c" }}>
          {page.filepath}
        </span>
      </div>
      <h2
        className="mb-5 mt-3 font-semibold"
        style={{ fontFamily: "IBM Plex Mono", fontSize: 22, lineHeight: 1.3, color: "#e0dfe6" }}
      >
        {page.title}
      </h2>
      <div style={{ color: "#b0afba" }}>{renderContent(page.content)}</div>
      {page.links?.length > 0 && (
        <div className="mt-7 pt-4" style={{ borderTop: "1px solid #1e1e2e" }}>
          <div
            className="mb-2 uppercase tracking-widest"
            style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#4a4a5c" }}
          >
            Linked Pages
          </div>
          <div className="flex flex-wrap gap-1.5">
            {page.links.map((l) => (
              <span
                key={l}
                onClick={() => onNavigate(l)}
                className="cursor-pointer px-2.5 py-1 rounded"
                style={{
                  fontFamily: "IBM Plex Mono",
                  fontSize: 12,
                  color: "#90c4ff",
                  background: "#2a2a3e",
                }}
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
  const [screen, setScreen] = useState<Screen>("brains");
  const [brains, setBrains] = useState<BrainConfig[]>([]);
  const [activeBrain, setActiveBrain] = useState<BrainConfig | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"pages" | "graph" | "log">("pages");
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createTopic, setCreateTopic] = useState("");
  const [createDir, setCreateDir] = useState("");
  const [sourceCount, setSourceCount] = useState<number>(20);
  const [browseDirs, setBrowseDirs] = useState<{ name: string; path: string }[]>([]);
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseCurrent, setBrowseCurrent] = useState("");
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");

  // Review state (step 2 of brain creation)
  const [pendingBrain, setPendingBrain] = useState<BrainConfig | null>(null);
  const [candidatePapers, setCandidatePapers] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());
  const [reviewSearchQuery, setReviewSearchQuery] = useState("");
  const [reviewSearching, setReviewSearching] = useState(false);

  // Wiki interaction state
  const [ingestQuery, setIngestQuery] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<Paper[]>([]);
  const [ingestSelected, setIngestSelected] = useState<Set<string>>(new Set());
  const [ingestSearching, setIngestSearching] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [querying, setQuerying] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [lintResult, setLintResult] = useState<{
    issues: { type: string; description: string; page?: string }[];
    suggestions: string[];
  } | null>(null);
  const [linting, setLinting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // Upload-your-own-files flow (alternative to paper search on create screen)
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Token usage stats for the active brain
  const [tokenSummary, setTokenSummary] = useState<TokenSummary | null>(null);
  const [tokenStatsOpen, setTokenStatsOpen] = useState(false);

  // Load brains on mount
  useEffect(() => {
    loadBrains();
  }, []);

  const loadBrains = async () => {
    try {
      const res = await fetch("/api/brains");
      const data = await res.json();
      setBrains(data.brains || []);
    } catch {
      // ignore
    }
  };

  const loadTokenSummary = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/brains/${id}/tokens`);
      const data = await res.json();
      if (data.error) return;
      setTokenSummary(data);
    } catch {
      // non-fatal — token stats are optional UI
    }
  }, []);

  const loadBrain = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/brains/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setActiveBrain(data.brain);
      setPages(data.pages || []);
      setLog(data.log || []);
      const overview = (data.pages || []).find((p: WikiPage) => p.type === "overview");
      setActivePage(overview?.id || data.pages?.[0]?.id || null);
      setScreen("wiki");
      loadTokenSummary(id);
    } catch (e: any) {
      setError(e.message);
    }
  }, [loadTokenSummary]);

  const browseTo = useCallback(async (dirPath?: string) => {
    try {
      const url = dirPath ? `/api/browse?path=${encodeURIComponent(dirPath)}` : "/api/browse";
      const res = await fetch(url);
      const data = await res.json();
      setBrowseDirs(data.dirs || []);
      setBrowseParent(data.parent || null);
      setBrowseCurrent(data.current || "");
      if (!createDir) setCreateDir(data.current || "");
    } catch {
      // ignore
    }
  }, [createDir]);

  const createFolder = useCallback(async () => {
    if (!newFolderName.trim() || !browseCurrent) return;
    setNewFolderError("");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: browseCurrent, name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setNewFolderError(data.error);
        return;
      }
      setNewFolderName("");
      setNewFolderMode(false);
      await browseTo(data.path);
      setCreateDir(data.path);
    } catch {
      setNewFolderError("Failed to create folder");
    }
  }, [newFolderName, browseCurrent, browseTo]);

  const handleCreate = useCallback(async () => {
    if (!createName.trim() || !createTopic.trim() || !createDir) return;
    setScreen("loading");
    setLoadingMessage(`Searching Semantic Scholar, arXiv, OpenAlex for "${createTopic}"...`);
    setError(null);
    try {
      const res = await fetch("/api/brains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          topic: createTopic,
          directory: createDir,
          sourceCount,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadBrains();
      const papers: Paper[] = data.papers || [];
      setPendingBrain(data.brain);
      setCandidatePapers(papers);
      setSelectedPaperIds(new Set(papers.map((p) => p.id)));
      setExpandedAbstracts(new Set());
      setReviewSearchQuery("");
      setScreen("review");
    } catch (e: any) {
      setError(e.message);
      setScreen("create");
    }
  }, [createName, createTopic, createDir, sourceCount, loadBrain]);

  const handleUploadCreate = useCallback(async () => {
    if (uploadFiles.length === 0) return;
    if (!createName.trim() || !createDir) return;
    setScreen("loading");
    setLoadingMessage("Creating brain from uploaded files...");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("name", createName);
      formData.append("topic", createTopic);
      formData.append("directory", createDir);
      for (const file of uploadFiles) formData.append("files", file);
      const res = await fetch("/api/brains/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadBrains();
      setUploadFiles([]);
      await loadBrain(data.brain.id);
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setScreen("create");
    }
  }, [uploadFiles, createName, createTopic, createDir, loadBrain]);

  const toggleSelectedPaper = useCallback((paperId: string) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }, []);

  const toggleAbstract = useCallback((paperId: string) => {
    setExpandedAbstracts((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }, []);

  const handleReviewSearch = useCallback(async () => {
    if (!reviewSearchQuery.trim() || !pendingBrain) return;
    setReviewSearching(true);
    try {
      const res = await fetch(`/api/brains/${pendingBrain.id}/ingest/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: reviewSearchQuery }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const newPapers: Paper[] = data.papers || [];
      // Append, skipping any IDs we already have.
      setCandidatePapers((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const additions = newPapers.filter((p) => !existingIds.has(p.id));
        // Auto-select newly added papers.
        setSelectedPaperIds((sel) => {
          const next = new Set(sel);
          for (const p of additions) next.add(p.id);
          return next;
        });
        return [...prev, ...additions];
      });
      setReviewSearchQuery("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReviewSearching(false);
    }
  }, [reviewSearchQuery, pendingBrain]);

  const handleCompile = useCallback(async () => {
    if (!pendingBrain) return;
    const chosen = candidatePapers.filter((p) => selectedPaperIds.has(p.id));
    setScreen("loading");
    setLoadingMessage(
      chosen.length === 0
        ? `Creating empty brain "${pendingBrain.name}"...`
        : `Compiling wiki from ${chosen.length} paper${chosen.length === 1 ? "" : "s"}...`
    );
    setError(null);
    try {
      const res = await fetch(`/api/brains/${pendingBrain.id}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: chosen }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadBrain(pendingBrain.id);
      setPendingBrain(null);
      setCandidatePapers([]);
      setSelectedPaperIds(new Set());
    } catch (e: any) {
      setError(e.message);
      setScreen("review");
    }
  }, [pendingBrain, candidatePapers, selectedPaperIds, loadBrain]);

  const handleRemoveBrain = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      try {
        await fetch(`/api/brains/${id}`, { method: "DELETE" });
        await loadBrains();
      } catch {
        // ignore
      }
    },
    []
  );

  const handleIngestSearch = useCallback(async () => {
    if (!ingestQuery.trim() || !activeBrain) return;
    setIngestSearching(true);
    setIngestResults([]);
    setIngestSelected(new Set());
    try {
      const res = await fetch(`/api/brains/${activeBrain.id}/ingest/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ingestQuery }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const papers: Paper[] = data.papers || [];
      setIngestResults(papers);
      // Default: select all results so single-click "Add selected" is fast.
      setIngestSelected(new Set(papers.map((p) => p.id)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIngestSearching(false);
    }
  }, [ingestQuery, activeBrain]);

  const toggleIngestSelected = useCallback((paperId: string) => {
    setIngestSelected((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }, []);

  const handleIngestAdd = useCallback(async () => {
    if (!activeBrain) return;
    const chosen = ingestResults.filter((p) => ingestSelected.has(p.id));
    if (chosen.length === 0) return;
    setIngesting(true);
    try {
      const res = await fetch(`/api/brains/${activeBrain.id}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: chosen }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadBrain(activeBrain.id);
      setIngestQuery("");
      setIngestResults([]);
      setIngestSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIngesting(false);
    }
  }, [activeBrain, ingestResults, ingestSelected, loadBrain]);

  const handleQuery = useCallback(async () => {
    if (!queryText.trim() || !activeBrain) return;
    setQuerying(true);
    setQueryAnswer(null);
    try {
      const res = await fetch(`/api/brains/${activeBrain.id}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: queryText }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQueryAnswer(data.answer);
      loadTokenSummary(activeBrain.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuerying(false);
    }
  }, [queryText, activeBrain, loadTokenSummary]);

  const handleSaveQueryAsPage = useCallback(async () => {
    if (!queryText.trim() || !activeBrain) return;
    try {
      const res = await fetch(`/api/brains/${activeBrain.id}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: queryText, saveAsPage: true }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadBrain(activeBrain.id);
      setQueryAnswer(null);
      setQueryText("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [queryText, activeBrain, loadBrain]);

  const handleLint = useCallback(async () => {
    if (!activeBrain) return;
    setLinting(true);
    setLintResult(null);
    try {
      const res = await fetch(`/api/brains/${activeBrain.id}/lint`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLintResult(data);
      loadTokenSummary(activeBrain.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinting(false);
    }
  }, [activeBrain, loadTokenSummary]);

  const handleExport = useCallback(async () => {
    if (!activeBrain) return;
    window.open(`/api/brains/${activeBrain.id}/export`, "_blank");
  }, [activeBrain]);

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

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? (bytes / 1024).toFixed(1) + " KB"
      : (bytes / (1024 * 1024)).toFixed(1) + " MB";

  // ─── BRAIN SELECTOR ───
  if (screen === "brains") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-3xl w-full">
          <div className="mb-10">
            <div
              className="uppercase tracking-[0.15em] mb-3"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#8b6fc0" }}
            >
              Distill
            </div>
            <h1
              className="font-semibold leading-tight"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 32, color: "#e0dfe6" }}
            >
              Your Brains
            </h1>
            <p className="mt-2" style={{ fontSize: 14, color: "#7a7a8c", lineHeight: 1.6 }}>
              Each brain is a self-contained knowledge wiki on your filesystem
            </p>
          </div>

          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-lg text-sm"
              style={{
                background: "rgba(212,106,106,0.1)",
                color: "#d46a6a",
                border: "1px solid rgba(212,106,106,0.2)",
              }}
            >
              {error}
              <button
                onClick={() => setError(null)}
                className="float-right"
                style={{ background: "none", border: "none", color: "#d46a6a", cursor: "pointer" }}
              >
                x
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {brains.map((brain) => (
              <div
                key={brain.id}
                onClick={() => loadBrain(brain.id)}
                className="group relative p-4 rounded-lg cursor-pointer"
                style={{
                  background: "#12121a",
                  border: "1px solid #1e1e2e",
                  transition: "border-color 0.15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = "#c4a1ff40")}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = "#1e1e2e")}
              >
                <div
                  className="font-medium mb-1"
                  style={{ fontFamily: "IBM Plex Mono", fontSize: 14, color: "#e0dfe6" }}
                >
                  {brain.name}
                </div>
                <div className="mb-2" style={{ fontSize: 13, color: "#7a7a8c" }}>
                  {brain.topic}
                </div>
                <div
                  className="truncate"
                  style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#4a4a5c" }}
                >
                  {brain.path}
                </div>
                <button
                  onClick={(e) => handleRemoveBrain(e, brain.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded"
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: 10,
                    color: "#d46a6a",
                    background: "rgba(212,106,106,0.1)",
                    border: "none",
                    cursor: "pointer",
                    transition: "opacity 0.15s",
                  }}
                >
                  remove
                </button>
              </div>
            ))}

            {/* New Brain card */}
            <div
              onClick={() => {
                setScreen("create");
                setCreateName("");
                setCreateTopic("");
                setCreateDir("");
                setError(null);
                browseTo();
              }}
              className="flex items-center justify-center p-4 rounded-lg cursor-pointer"
              style={{
                border: "2px dashed #1e1e2e",
                minHeight: 100,
                transition: "border-color 0.15s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = "#c4a1ff40")}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = "#1e1e2e")}
            >
              <div className="text-center">
                <div style={{ fontSize: 24, color: "#4a4a5c", marginBottom: 4 }}>+</div>
                <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#4a4a5c" }}>
                  New Brain
                </div>
              </div>
            </div>
          </div>

          <p
            className="mt-6"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 11,
              color: "#5a5a6c",
              lineHeight: 1.6,
            }}
          >
            Note: <span style={{ color: "#7a7a8c" }}>remove</span> only unregisters the brain from Distill &mdash; the folder on disk is left intact. Delete it manually from your filesystem if you want it gone for good.
          </p>
        </div>
      </div>
    );
  }

  // ─── CREATE BRAIN ───
  if (screen === "create") {
    const previewPath =
      createDir && createName
        ? `${createDir}/${slugify(createName)}/`
        : null;

    const canCreate = createName.trim() && createTopic.trim() && createDir;

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <button
            onClick={() => {
              setScreen("brains");
              setError(null);
            }}
            className="mb-6"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 13,
              color: "#8b6fc0",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            &larr; Back
          </button>

          <h1
            className="font-semibold mb-8"
            style={{ fontFamily: "IBM Plex Mono", fontSize: 24, color: "#e0dfe6" }}
          >
            Create a New Brain
          </h1>

          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-lg text-sm"
              style={{
                background: "rgba(212,106,106,0.1)",
                color: "#d46a6a",
                border: "1px solid rgba(212,106,106,0.2)",
              }}
            >
              {error}
            </div>
          )}

          {/* Brain Name */}
          <div className="mb-5">
            <label
              className="block mb-1.5 uppercase tracking-widest"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}
            >
              Brain Name
            </label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Transformer Research"
              className="w-full outline-none"
              style={{
                padding: "10px 14px",
                fontSize: 14,
                color: "#e0dfe6",
                background: "#12121a",
                border: "1px solid #1e1e2e",
                borderRadius: 8,
              }}
            />
          </div>

          {/* Research Topic */}
          <div className="mb-5">
            <label
              className="block mb-1.5 uppercase tracking-widest"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}
            >
              Research Topic
            </label>
            <input
              value={createTopic}
              onChange={(e) => setCreateTopic(e.target.value)}
              placeholder="e.g. transformer architecture"
              className="w-full outline-none"
              style={{
                padding: "10px 14px",
                fontSize: 14,
                color: "#e0dfe6",
                background: "#12121a",
                border: "1px solid #1e1e2e",
                borderRadius: 8,
              }}
            />
          </div>

          {/* Initial Sources */}
          <div className="mb-5">
            <label
              className="block mb-1.5 uppercase tracking-widest"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}
            >
              Initial sources
            </label>
            <div className="flex items-center gap-2">
              {[10, 20, 30, 50].map((n) => {
                const selected = sourceCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSourceCount(n)}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      fontFamily: "IBM Plex Mono",
                      fontSize: 13,
                      color: selected ? "#7ec99a" : "#c4a1ff",
                      background: selected
                        ? "rgba(126,201,154,0.1)"
                        : "#12121a",
                      border: selected
                        ? "1px solid rgba(126,201,154,0.4)"
                        : "1px solid #1e1e2e",
                      cursor: "pointer",
                      minWidth: 56,
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div
              className="mt-1.5"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}
            >
              More sources = richer wiki, but longer compile time and higher token cost
            </div>
          </div>

          {/* Directory Picker */}
          <div className="mb-5">
            <label
              className="block mb-1.5 uppercase tracking-widest"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}
            >
              Directory
            </label>
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid #1e1e2e", background: "#12121a" }}
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: "1px solid #1e1e2e" }}
              >
                <span
                  className="truncate flex-1"
                  style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#7a7a8c" }}
                >
                  {browseCurrent || "Loading..."}
                </span>
                <button
                  onClick={() => setCreateDir(browseCurrent)}
                  className="px-3 py-1 rounded ml-2"
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: 11,
                    color: createDir === browseCurrent ? "#7ec99a" : "#c4a1ff",
                    background:
                      createDir === browseCurrent
                        ? "rgba(126,201,154,0.1)"
                        : "rgba(196,161,255,0.1)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {createDir === browseCurrent ? "Selected" : "Select"}
                </button>
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {browseParent && (
                  <div
                    onClick={() => browseTo(browseParent)}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    style={{ color: "#7a7a8c", fontSize: 13 }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = "rgba(196,161,255,0.05)")
                    }
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}>..</span>
                  </div>
                )}
                {browseDirs.map((d) => (
                  <div
                    key={d.path}
                    onClick={() => browseTo(d.path)}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    style={{ color: "#e0dfe6", fontSize: 13 }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = "rgba(196,161,255,0.05)")
                    }
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ color: "#c4a1ff" }}>&#128193;</span>
                    {d.name}
                  </div>
                ))}
                {browseDirs.length === 0 && !browseParent && (
                  <div className="px-3 py-3" style={{ fontSize: 12, color: "#4a4a5c" }}>
                    No subdirectories
                  </div>
                )}
                {/* New Folder */}
                <div
                  style={{ borderTop: "1px solid #1e1e2e" }}
                  className="px-3 py-2"
                >
                  {newFolderMode ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={newFolderName}
                          onChange={(e) => {
                            setNewFolderName(e.target.value);
                            setNewFolderError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") createFolder();
                            if (e.key === "Escape") {
                              setNewFolderMode(false);
                              setNewFolderName("");
                              setNewFolderError("");
                            }
                          }}
                          placeholder="Folder name"
                          className="flex-1 px-2 py-1 rounded"
                          style={{
                            fontFamily: "IBM Plex Mono",
                            fontSize: 12,
                            background: "#0a0a12",
                            border: "1px solid #2a2a3c",
                            color: "#e0dfe6",
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={createFolder}
                          className="px-2 py-1 rounded"
                          style={{
                            fontFamily: "IBM Plex Mono",
                            fontSize: 11,
                            color: "#7ec99a",
                            background: "rgba(126,201,154,0.1)",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Create
                        </button>
                        <button
                          onClick={() => {
                            setNewFolderMode(false);
                            setNewFolderName("");
                            setNewFolderError("");
                          }}
                          className="px-2 py-1 rounded"
                          style={{
                            fontFamily: "IBM Plex Mono",
                            fontSize: 11,
                            color: "#7a7a8c",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      {newFolderError && (
                        <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#ff6b6b" }}>
                          {newFolderError}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewFolderMode(true)}
                      className="flex items-center gap-2 w-full"
                      style={{
                        fontFamily: "IBM Plex Mono",
                        fontSize: 12,
                        color: "#c4a1ff",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>+</span>
                      New Folder
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          {previewPath && (
            <div
              className="mb-5 px-3 py-2 rounded-lg"
              style={{
                background: "rgba(196,161,255,0.05)",
                border: "1px solid rgba(196,161,255,0.1)",
              }}
            >
              <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#7a7a8c" }}>
                Brain will be created at:{" "}
              </span>
              <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#c4a1ff" }}>
                {previewPath}
              </span>
            </div>
          )}

          {/* Flow note */}
          <div
            className="mb-6 px-3 py-2 rounded-lg"
            style={{
              background: "rgba(196,161,255,0.04)",
              border: "1px solid rgba(196,161,255,0.08)",
              fontSize: 12,
              color: "#7a7a8c",
              lineHeight: 1.6,
            }}
          >
            Next: we&rsquo;ll search Semantic Scholar, arXiv, and OpenAlex for papers
            about your topic so you can review and curate them before compiling.
          </div>

          {/* Create button */}
          <button
            onClick={uploadFiles.length > 0 ? handleUploadCreate : handleCreate}
            disabled={!canCreate}
            className="w-full py-3 rounded-lg font-medium"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 14,
              color: canCreate ? "#0a0a0f" : "#4a4a5c",
              background: canCreate ? "#c4a1ff" : "#1e1e2e",
              border: "none",
              cursor: canCreate ? "pointer" : "not-allowed",
            }}
          >
            {uploadFiles.length > 0
              ? "Create brain from files \u2192"
              : "Search for Papers \u2192"}
          </button>

          {/* Divider: "or" */}
          <div
            className="flex items-center"
            style={{ margin: "18px 0" }}
          >
            <div style={{ flex: 1, height: 1, background: "#1e1e2e" }} />
            <span
              style={{
                fontFamily: "IBM Plex Mono",
                color: "#4a4a5c",
                fontSize: 11,
                padding: "0 12px",
              }}
            >
              or
            </span>
            <div style={{ flex: 1, height: 1, background: "#1e1e2e" }} />
          </div>

          {/* Hidden file input */}
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length > 0) {
                setUploadFiles((prev) => [...prev, ...files]);
              }
              e.target.value = "";
            }}
          />

          {/* Upload button */}
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="w-full py-3 rounded-lg"
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 14,
              color: "#c4a1ff",
              background: "rgba(196,161,255,0.06)",
              border: "1px solid rgba(196,161,255,0.15)",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c4a1ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload my own files</span>
            <span
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(126,201,154,0.12)",
                color: "#7ec99a",
              }}
            >
              Beta
            </span>
          </button>

          {/* Subtitle */}
          <div
            style={{
              color: "#5a5a6c",
              fontSize: 11,
              textAlign: "center",
              marginTop: 8,
              fontFamily: "IBM Plex Mono",
            }}
          >
            Upload PDFs from a course, textbook, or any document collection
          </div>

          {/* Selected files panel */}
          {uploadFiles.length > 0 && (
            <div
              style={{
                background: "rgba(196,161,255,0.04)",
                border: "1px solid rgba(196,161,255,0.12)",
                borderRadius: 8,
                padding: 12,
                marginTop: 12,
              }}
            >
              <div className="flex flex-col" style={{ gap: 6 }}>
                {uploadFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center"
                    style={{ gap: 8 }}
                  >
                    <span
                      className="truncate flex-1"
                      style={{
                        fontFamily: "IBM Plex Mono",
                        fontSize: 12,
                        color: "#c4a1ff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={f.name}
                    >
                      {f.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "IBM Plex Mono",
                        fontSize: 11,
                        color: "#5a5a6c",
                        flexShrink: 0,
                      }}
                    >
                      {formatFileSize(f.size)}
                    </span>
                    <button
                      onClick={() =>
                        setUploadFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                      style={{
                        fontFamily: "IBM Plex Mono",
                        fontSize: 14,
                        color: "#5a5a6c",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 4px",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.color = "#c4a1ff")
                      }
                      onMouseOut={(e) =>
                        (e.currentTarget.style.color = "#5a5a6c")
                      }
                      aria-label={`Remove ${f.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div
                style={{
                  borderTop: "1px solid rgba(196,161,255,0.12)",
                  marginTop: 10,
                  paddingTop: 8,
                  fontFamily: "IBM Plex Mono",
                  fontSize: 11,
                  color: "#7a7a8c",
                }}
              >
                {uploadFiles.length} file{uploadFiles.length === 1 ? "" : "s"} selected (
                {formatFileSize(
                  uploadFiles.reduce((sum, f) => sum + f.size, 0),
                )}
                )
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── REVIEW PAPERS ───
  if (screen === "review") {
    const selectedCount = candidatePapers.filter((p) => selectedPaperIds.has(p.id)).length;
    const hasNoInitialPapers = candidatePapers.length === 0;

    return (
      <div className="min-h-screen flex flex-col" style={{ paddingBottom: 80 }}>
        <div className="max-w-3xl w-full mx-auto px-6 pt-10">
          <button
            onClick={() => {
              setScreen("create");
              setError(null);
            }}
            className="mb-4"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 13,
              color: "#8b6fc0",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            &larr; Back
          </button>

          <div
            className="uppercase tracking-[0.15em] mb-2"
            style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#8b6fc0" }}
          >
            {pendingBrain?.name}
          </div>
          <h1
            className="font-semibold mb-1"
            style={{ fontFamily: "IBM Plex Mono", fontSize: 26, color: "#e0dfe6" }}
          >
            Review Papers
          </h1>
          <p className="mb-8" style={{ fontSize: 13, color: "#7a7a8c" }}>
            {hasNoInitialPapers
              ? `No papers found for "${pendingBrain?.topic}". Try different keywords below, or compile an empty brain you can fill manually.`
              : `${candidatePapers.length} paper${candidatePapers.length === 1 ? "" : "s"} found for "${pendingBrain?.topic}". Uncheck any you don't want included.`}
          </p>

          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-lg text-sm"
              style={{
                background: "rgba(212,106,106,0.1)",
                color: "#d46a6a",
                border: "1px solid rgba(212,106,106,0.2)",
              }}
            >
              {error}
              <button
                onClick={() => setError(null)}
                className="float-right"
                style={{ background: "none", border: "none", color: "#d46a6a", cursor: "pointer" }}
              >
                x
              </button>
            </div>
          )}

          {/* Search for more */}
          <div className="flex gap-2 mb-6">
            <input
              value={reviewSearchQuery}
              onChange={(e) => setReviewSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReviewSearch()}
              placeholder="Search for more papers..."
              className="flex-1 outline-none"
              style={{
                padding: "10px 14px",
                fontSize: 13,
                color: "#e0dfe6",
                background: "#12121a",
                border: "1px solid #1e1e2e",
                borderRadius: 8,
              }}
              disabled={reviewSearching}
            />
            <button
              onClick={handleReviewSearch}
              disabled={reviewSearching || !reviewSearchQuery.trim()}
              className="px-4 rounded-lg"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 12,
                color: "#c4a1ff",
                background: "rgba(196,161,255,0.1)",
                border: "1px solid rgba(196,161,255,0.2)",
                cursor: reviewSearching ? "wait" : "pointer",
              }}
            >
              {reviewSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Paper list */}
          <div className="flex flex-col gap-2.5">
            {candidatePapers.map((paper) => {
              const isSelected = selectedPaperIds.has(paper.id);
              const isExpanded = expandedAbstracts.has(paper.id);
              const authorPreview =
                paper.authors.slice(0, 3).join(", ") +
                (paper.authors.length > 3 ? ", et al." : "");
              const absPreview =
                paper.abstract.length > 150 && !isExpanded
                  ? paper.abstract.slice(0, 150) + "..."
                  : paper.abstract;

              return (
                <div
                  key={paper.id}
                  className="p-4 rounded-lg"
                  style={{
                    background: isSelected ? "#12121a" : "#0d0d14",
                    border: `1px solid ${isSelected ? "#2a2a3c" : "#1a1a26"}`,
                    opacity: isSelected ? 1 : 0.55,
                    transition: "opacity 0.15s, background 0.15s",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectedPaper(paper.id)}
                      className="mt-1"
                      style={{ accentColor: "#c4a1ff", flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div
                          className="font-semibold"
                          style={{ fontSize: 14, color: "#e0dfe6", lineHeight: 1.4 }}
                        >
                          {paper.title}
                        </div>
                        <SourceBadge source={paper.source_api} />
                      </div>
                      <div style={{ fontSize: 12, color: "#7a7a8c", marginBottom: 4 }}>
                        {authorPreview || "Unknown authors"}
                      </div>
                      <div
                        className="flex items-center gap-3 mb-2"
                        style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c" }}
                      >
                        <span>{paper.year ?? "n.d."}</span>
                        <span>&middot;</span>
                        <span>
                          {paper.citationCount.toLocaleString()} citation
                          {paper.citationCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {paper.abstract && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#8a8a9c",
                            lineHeight: 1.6,
                          }}
                        >
                          {absPreview}
                          {paper.abstract.length > 150 && (
                            <button
                              onClick={() => toggleAbstract(paper.id)}
                              className="ml-1"
                              style={{
                                fontFamily: "IBM Plex Mono",
                                fontSize: 11,
                                color: "#8b6fc0",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              {isExpanded ? "show less" : "show more"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="fixed bottom-0 left-0 right-0"
          style={{
            background: "rgba(10,10,15,0.95)",
            borderTop: "1px solid #1e1e2e",
            backdropFilter: "blur(8px)",
            padding: "14px 24px",
          }}
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#7a7a8c" }}>
              {selectedCount} paper{selectedCount === 1 ? "" : "s"} selected
            </div>
            <button
              onClick={handleCompile}
              className="px-5 py-2.5 rounded-lg font-medium"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 13,
                color: "#0a0a0f",
                background: "#c4a1ff",
                border: "none",
                cursor: "pointer",
              }}
            >
              {selectedCount === 0 ? "Compile Empty Brain →" : "Compile Brain →"}
            </button>
          </div>
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
                style={{
                  background: "#c4a1ff",
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
          <p style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: "#7a7a8c" }}>
            {loadingMessage || "Loading..."}
          </p>
          <style>{`@keyframes pulse { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }`}</style>
        </div>
      </div>
    );
  }

  // ─── WIKI VIEWER ───
  const currentPage = pages.find((p) => p.id === activePage) || null;
  const typeOrder: Record<string, number> = {
    overview: 0,
    concept: 1,
    entity: 2,
    source: 3,
    analysis: 4,
  };
  const sortedPages = [...pages].sort(
    (a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
  );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div
        className="flex flex-col"
        style={{
          width: 280,
          minWidth: 280,
          borderRight: "1px solid #1e1e2e",
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        <div className="p-4 pb-3" style={{ borderBottom: "1px solid #1e1e2e" }}>
          <button
            onClick={() => {
              setScreen("brains");
              setActiveBrain(null);
              setPages([]);
              setQueryAnswer(null);
              setLintResult(null);
            }}
            className="mb-1"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 11,
              color: "#8b6fc0",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            &larr; All Brains
          </button>
          <div
            className="font-semibold"
            style={{ fontFamily: "IBM Plex Mono", fontSize: 15, color: "#e0dfe6" }}
          >
            {activeBrain?.name}
          </div>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c" }}>
            {pages.length} pages &middot;{" "}
            <span className="truncate" title={activeBrain?.path}>
              {activeBrain?.path}
            </span>
          </div>
        </div>

        {/* Ingest bar */}
        <div className="p-3" style={{ borderBottom: "1px solid #1e1e2e" }}>
          <div className="flex gap-1.5">
            <input
              value={ingestQuery}
              onChange={(e) => setIngestQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleIngestSearch()}
              placeholder="Search for papers..."
              className="flex-1 outline-none px-2.5 py-1.5 rounded"
              style={{
                fontSize: 12,
                color: "#e0dfe6",
                background: "#1a1a26",
                border: "1px solid #1e1e2e",
              }}
              disabled={ingestSearching || ingesting}
            />
            <button
              onClick={handleIngestSearch}
              disabled={ingestSearching || ingesting || !ingestQuery.trim()}
              className="px-2.5 py-1.5 rounded"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 11,
                color: "#0a0a0f",
                background:
                  ingestSearching || ingesting || !ingestQuery.trim()
                    ? "#4a4a5c"
                    : "#c4a1ff",
                border: "none",
                cursor: "pointer",
              }}
            >
              {ingestSearching ? "..." : "go"}
            </button>
          </div>

          {/* Results dropdown */}
          {ingestResults.length > 0 && (
            <div
              className="mt-2 rounded"
              style={{
                background: "#0d0d14",
                border: "1px solid #1e1e2e",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {ingestResults.map((paper) => {
                const isSelected = ingestSelected.has(paper.id);
                return (
                  <div
                    key={paper.id}
                    onClick={() => toggleIngestSelected(paper.id)}
                    className="px-2.5 py-2 cursor-pointer"
                    style={{
                      borderBottom: "1px solid #14141c",
                      background: isSelected ? "rgba(196,161,255,0.06)" : "transparent",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleIngestSelected(paper.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                        style={{ accentColor: "#c4a1ff", flexShrink: 0 }}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          style={{
                            fontSize: 11,
                            color: "#e0dfe6",
                            lineHeight: 1.35,
                            marginBottom: 2,
                          }}
                        >
                          {paper.title.length > 80
                            ? paper.title.slice(0, 78) + "..."
                            : paper.title}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{
                              fontFamily: "IBM Plex Mono",
                              fontSize: 10,
                              color: "#4a4a5c",
                            }}
                          >
                            {paper.year ?? "n.d."}
                          </span>
                          <SourceBadge source={paper.source_api} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-2.5 py-2" style={{ background: "#0a0a12" }}>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}>
                  {ingestSelected.size} selected
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setIngestResults([]);
                      setIngestSelected(new Set());
                    }}
                    disabled={ingesting}
                    className="px-2 py-1 rounded"
                    style={{
                      fontFamily: "IBM Plex Mono",
                      fontSize: 10,
                      color: "#7a7a8c",
                      background: "transparent",
                      border: "1px solid #1e1e2e",
                      cursor: "pointer",
                    }}
                  >
                    clear
                  </button>
                  <button
                    onClick={handleIngestAdd}
                    disabled={ingesting || ingestSelected.size === 0}
                    className="px-2 py-1 rounded"
                    style={{
                      fontFamily: "IBM Plex Mono",
                      fontSize: 10,
                      color: "#0a0a0f",
                      background:
                        ingesting || ingestSelected.size === 0 ? "#4a4a5c" : "#c4a1ff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {ingesting ? "adding..." : "add selected"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 p-3" style={{ borderBottom: "1px solid #1e1e2e" }}>
          <button
            onClick={handleLint}
            disabled={linting}
            className="flex-1 py-1.5 rounded"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 11,
              color: "#d4a855",
              background: "rgba(212,168,85,0.1)",
              border: "1px solid rgba(212,168,85,0.2)",
              cursor: "pointer",
            }}
          >
            {linting ? "Checking..." : "Health Check"}
          </button>
          <button
            onClick={handleExport}
            className="flex-1 py-1.5 rounded"
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 11,
              color: "#7ec99a",
              background: "rgba(126,201,154,0.1)",
              border: "1px solid rgba(126,201,154,0.2)",
              cursor: "pointer",
            }}
          >
            Export
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid #1e1e2e" }}>
          {(["pages", "graph", "log"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className="flex-1 py-2.5 uppercase tracking-wider"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 11,
                color: sidebarTab === tab ? "#c4a1ff" : "#4a4a5c",
                background: "none",
                border: "none",
                borderBottom:
                  sidebarTab === tab ? "2px solid #c4a1ff" : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Token usage stats */}
        {tokenSummary && tokenSummary.total_tokens > 0 && (
          <div style={{ borderBottom: "1px solid #1e1e2e" }}>
            <button
              onClick={() => setTokenStatsOpen((o) => !o)}
              className="w-full text-left px-3 py-2"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 10,
                color: "#7a7a8c",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              title="Click to toggle breakdown"
            >
              {formatInt(tokenSummary.total_tokens)} tokens ·{" "}
              {formatCost(tokenSummary.estimated_cost_usd)}
              {tokenSummary.by_operation.query.count > 0 &&
                tokenSummary.tokens_saved > 0 && (() => {
                  const ratio =
                    tokenSummary.estimated_tokens_without_wiki /
                    Math.max(1, tokenSummary.total_tokens);
                  return (
                    <>
                      {" · "}
                      <span style={{ color: "#7ec99a" }}>
                        ~{ratio.toFixed(1)}x more efficient than RAG
                      </span>
                    </>
                  );
                })()}
              <span style={{ float: "right", color: "#4a4a5c" }}>
                {tokenStatsOpen ? "▾" : "▸"}
              </span>
            </button>
            {tokenStatsOpen && (
              <div
                className="px-3 pb-2"
                style={{
                  fontFamily: "IBM Plex Mono",
                  fontSize: 10,
                  color: "#7a7a8c",
                }}
              >
                <div style={{ color: "#4a4a5c", marginBottom: 4 }}>
                  {tokenSummary.provider} · {tokenSummary.model}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", rowGap: 2, columnGap: 8 }}>
                  <div style={{ color: "#4a4a5c" }}>in</div>
                  <div />
                  <div>{formatInt(tokenSummary.total_input)}</div>
                  <div style={{ color: "#4a4a5c" }}>out</div>
                  <div />
                  <div>{formatInt(tokenSummary.total_output)}</div>
                </div>
                <div style={{ color: "#4a4a5c", marginTop: 6, marginBottom: 2 }}>
                  by operation
                </div>
                {(["compile", "ingest", "query", "lint"] as const).map((op) => {
                  const b = tokenSummary.by_operation[op];
                  if (b.count === 0) return null;
                  return (
                    <div
                      key={op}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "60px 1fr auto",
                        columnGap: 8,
                      }}
                    >
                      <span style={{ color: "#7a7a8c" }}>{op}</span>
                      <span style={{ color: "#4a4a5c" }}>×{b.count}</span>
                      <span>{formatInt(b.input + b.output)}</span>
                    </div>
                  );
                })}
                {tokenSummary.by_operation.query.count > 0 && (
                  <div style={{ marginTop: 6, color: "#4a4a5c" }}>
                    RAG baseline: {formatInt(tokenSummary.estimated_tokens_without_wiki)} tokens
                    <br />
                    saved:{" "}
                    <span style={{ color: "#7ec99a" }}>
                      {formatInt(tokenSummary.tokens_saved)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {sidebarTab === "pages" &&
            sortedPages.map((p) => {
              const typeColor: Record<string, string> = {
                overview: "#c4a1ff",
                concept: "#90c4ff",
                entity: "#7ec99a",
                source: "#d4a855",
                analysis: "#d46a6a",
              };
              return (
                <div
                  key={p.id}
                  onClick={() => setActivePage(p.id)}
                  className="px-3 py-2.5 rounded-md cursor-pointer mb-0.5"
                  style={{
                    background:
                      activePage === p.id ? "rgba(196,161,255,0.08)" : "transparent",
                    borderLeft: `2px solid ${activePage === p.id ? "#c4a1ff" : "transparent"}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: activePage === p.id ? "#e0dfe6" : "#7a7a8c",
                      fontWeight: activePage === p.id ? 500 : 400,
                    }}
                  >
                    {p.title.length > 30 ? p.title.slice(0, 28) + "..." : p.title}
                  </div>
                  <span
                    className="uppercase tracking-wider"
                    style={{
                      fontFamily: "IBM Plex Mono",
                      fontSize: 9,
                      color: typeColor[p.type] || "#4a4a5c",
                    }}
                  >
                    {p.type}
                  </span>
                </div>
              );
            })}

          {sidebarTab === "graph" && (
            <WikiGraph pages={pages} activePage={activePage} onNavigate={setActivePage} />
          )}

          {sidebarTab === "log" &&
            [...log].reverse().map((entry, i) => {
              const ac: Record<string, string> = {
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
              return (
                <div key={i} className="py-2" style={{ borderBottom: "1px solid #1e1e2e" }}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="uppercase"
                      style={{
                        fontFamily: "IBM Plex Mono",
                        fontSize: 10,
                        color: ac[entry.action] || "#4a4a5c",
                      }}
                    >
                      {entry.action}
                    </span>
                    <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#4a4a5c" }}>
                      {new Date(entry.date).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-0.5" style={{ fontSize: 12, color: "#7a7a8c" }}>
                    {entry.detail.length > 50 ? entry.detail.slice(0, 48) + "..." : entry.detail}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto" style={{ maxWidth: 780 }}>
        {/* Query bar */}
        <div className="px-12 pt-6">
          <div className="flex gap-2">
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
              placeholder="Ask a question about this brain..."
              className="flex-1 outline-none"
              style={{
                padding: "10px 14px",
                fontSize: 13,
                color: "#e0dfe6",
                background: "#12121a",
                border: "1px solid #1e1e2e",
                borderRadius: 8,
              }}
              disabled={querying}
            />
            <button
              onClick={handleQuery}
              disabled={querying}
              className="px-4 rounded-lg"
              style={{
                fontFamily: "IBM Plex Mono",
                fontSize: 12,
                color: "#0a0a0f",
                background: querying ? "#4a4a5c" : "#c4a1ff",
                border: "none",
                cursor: "pointer",
              }}
            >
              {querying ? "..." : "Ask"}
            </button>
          </div>
        </div>

        {/* Query answer panel */}
        {queryAnswer && (
          <div
            className="mx-12 mt-4 p-4 rounded-lg"
            style={{
              background: "rgba(196,161,255,0.05)",
              border: "1px solid rgba(196,161,255,0.15)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="uppercase tracking-widest"
                style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#c4a1ff" }}
              >
                Answer
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveQueryAsPage}
                  className="px-2 py-0.5 rounded"
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: 10,
                    color: "#7ec99a",
                    background: "rgba(126,201,154,0.1)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Save as page
                </button>
                <button
                  onClick={() => setQueryAnswer(null)}
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: 12,
                    color: "#4a4a5c",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  x
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#b0afba", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {queryAnswer}
            </div>
          </div>
        )}

        {/* Lint results panel */}
        {lintResult && (
          <div
            className="mx-12 mt-4 p-4 rounded-lg"
            style={{
              background: "rgba(212,168,85,0.05)",
              border: "1px solid rgba(212,168,85,0.15)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="uppercase tracking-widest"
                style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#d4a855" }}
              >
                Health Check &middot; {lintResult.issues.length} issues
              </span>
              <button
                onClick={() => setLintResult(null)}
                style={{
                  fontFamily: "IBM Plex Mono",
                  fontSize: 12,
                  color: "#4a4a5c",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                x
              </button>
            </div>
            {lintResult.issues.map((issue, i) => (
              <div key={i} className="mb-2 flex gap-2" style={{ fontSize: 12 }}>
                <span
                  className="uppercase shrink-0"
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: 10,
                    color: "#d4a855",
                    marginTop: 2,
                  }}
                >
                  {issue.type}
                </span>
                <span style={{ color: "#7a7a8c" }}>{issue.description}</span>
              </div>
            ))}
            {lintResult.suggestions.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(212,168,85,0.15)" }}>
                <div
                  className="mb-2 uppercase tracking-widest"
                  style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: "#7a7a8c" }}
                >
                  Suggestions
                </div>
                {lintResult.suggestions.map((s, i) => (
                  <div key={i} className="mb-1" style={{ fontSize: 12, color: "#7a7a8c" }}>
                    &bull; {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            className="mx-12 mt-4 px-4 py-3 rounded-lg text-sm"
            style={{
              background: "rgba(212,106,106,0.1)",
              color: "#d46a6a",
              border: "1px solid rgba(212,106,106,0.2)",
            }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              className="float-right"
              style={{ background: "none", border: "none", color: "#d46a6a", cursor: "pointer" }}
            >
              x
            </button>
          </div>
        )}

        {/* Page content */}
        <div className="px-12 py-6">
          {currentPage ? (
            <PageView page={currentPage} onNavigate={handleNavigate} />
          ) : (
            <div
              className="text-center py-20"
              style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: "#4a4a5c" }}
            >
              Select a page from the sidebar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

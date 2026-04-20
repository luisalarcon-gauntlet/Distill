"use client";

import { useRef, useEffect } from "react";
import type { WikiPage } from "@/components/shared/types";

export function WikiGraph({
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

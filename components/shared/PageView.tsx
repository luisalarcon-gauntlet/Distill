"use client";

import type { WikiPage } from "@/components/shared/types";

export function PageView({
  page,
  onNavigate,
  onGenerateFlashcards,
  flashcardGenerating,
}: {
  page: WikiPage;
  onGenerateFlashcards?: () => void;
  flashcardGenerating?: boolean;
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
      <div className="flex items-center gap-2.5 mb-1" style={{ overflow: "hidden" }}>
        <span
          className="uppercase text-[10px] tracking-widest px-2 py-0.5 rounded"
          style={{
            color: typeColor[page.type] || "#7a7a8c",
            background: `${typeColor[page.type] || "#7a7a8c"}15`,
            fontFamily: "IBM Plex Mono",
            flexShrink: 0,
          }}
        >
          {page.type}
        </span>
        <span
          className="truncate"
          title={page.filepath}
          style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#4a4a5c", minWidth: 0 }}
        >
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

      {onGenerateFlashcards && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid #1e1e2e" }}>
          <button
            onClick={onGenerateFlashcards}
            disabled={flashcardGenerating}
            style={{
              padding: "6px 14px", borderRadius: 6,
              fontFamily: "IBM Plex Mono", fontSize: 11,
              color: flashcardGenerating ? "#4a4a5c" : "#c4a1ff",
              background: flashcardGenerating ? "rgba(74,74,92,0.1)" : "rgba(196,161,255,0.1)",
              border: `1px solid ${flashcardGenerating ? "rgba(74,74,92,0.2)" : "rgba(196,161,255,0.2)"}`,
              cursor: flashcardGenerating ? "default" : "pointer",
            }}
          >
            {flashcardGenerating ? "Generating..." : "Generate Flashcards for This Page"}
          </button>
        </div>
      )}
    </div>
  );
}

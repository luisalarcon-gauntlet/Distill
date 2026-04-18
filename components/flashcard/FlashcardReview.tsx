"use client";

import { useState, useEffect, useCallback } from "react";
import { Flashcard, Screen } from "@/components/shared/types";

interface FlashcardReviewProps {
  brainId: string;
  onNavigate: (screen: Screen, brainId?: string) => void;
}

export function FlashcardReview({ brainId, onNavigate }: FlashcardReviewProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [rated, setRated] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brains/${brainId}/flashcards`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Failed to load flashcards (${res.status})`);
      }
      const data: Flashcard[] = await res.json();
      setCards(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error loading flashcards");
    } finally {
      setLoading(false);
    }
  }, [brainId]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  async function handleRate(confidence: 0 | 1) {
    const card = cards[currentIndex];
    try {
      await fetch(`/api/brains/${brainId}/flashcards/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, confidence }),
      });
    } catch {
      // Fire-and-forget — local state advances regardless
    }

    const newRated = new Set(rated);
    newRated.add(card.id);

    if (newRated.size === cards.length) {
      setRated(newRated);
      setCompleted(true);
      return;
    }

    // Advance to next unrated card
    let nextIndex = currentIndex;
    for (let i = 1; i <= cards.length; i++) {
      const candidate = (currentIndex + i) % cards.length;
      if (!newRated.has(cards[candidate].id)) {
        nextIndex = candidate;
        break;
      }
    }

    setRated(newRated);
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
  }

  function handleReviewAgain() {
    setCurrentIndex(0);
    setIsFlipped(false);
    setRated(new Set());
    setCompleted(false);
  }

  function handlePrev() {
    setCurrentIndex((i) => i - 1);
    setIsFlipped(false);
  }

  function handleNext() {
    setCurrentIndex((i) => i + 1);
    setIsFlipped(false);
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-13)", color: "var(--fg-muted)" }}>
          Loading flashcards...
        </span>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", minHeight: "60vh" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-13)", color: "var(--danger)" }}>
          {error}
        </span>
        <button
          onClick={fetchCards}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-11)",
            color: "var(--fg-muted)",
            background: "var(--surface-2)",
            border: "var(--hairline)",
            borderRadius: "var(--r-md)",
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (cards.length === 0) {
    return (
      <div style={{ padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-13)", color: "var(--fg-muted)" }}>
          No flashcards yet — generate some from a course page.
        </span>
      </div>
    );
  }

  const card = cards[currentIndex];
  const progressPercent = ((currentIndex + 1) / cards.length) * 100;

  // ── Deck complete ──
  if (completed) {
    return (
      <div style={{ padding: "22px 24px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          minHeight: "50vh",
          textAlign: "center",
        }}>
          <span style={{ fontSize: "24px", color: "var(--success)", lineHeight: 1 }}>✓</span>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", color: "var(--fg-strong)", fontWeight: 600 }}>
            Deck complete
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-13)", color: "var(--fg-muted)" }}>
            You rated all {cards.length} cards.
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              onClick={handleReviewAgain}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-11)",
                color: "var(--fg-strong)",
                background: "var(--surface-2)",
                border: "var(--hairline)",
                borderRadius: "var(--r-md)",
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Review again
            </button>
            <button
              onClick={() => onNavigate("course", brainId)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-11)",
                color: "var(--bg)",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--r-md)",
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Back to course
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main review ──
  return (
    <div style={{ padding: "22px 24px", maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>

      {/* Progress row */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-10)",
          color: "var(--accent)",
          letterSpacing: "var(--track-label)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          FLASHCARD {currentIndex + 1} / {cards.length}
        </span>
        <div style={{ flex: 1, height: "2px", background: "var(--surface-2)", borderRadius: "1px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progressPercent}%`,
            background: "var(--accent)",
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* Card — 3D flip container */}
      <div
        className="card-flip"
        onClick={() => setIsFlipped((f) => !f)}
        role="button"
        aria-pressed={isFlipped}
        aria-label={isFlipped ? "Card showing answer — click to flip back" : "Click to reveal answer"}
      >
        <div className={`card-inner${isFlipped ? " is-flipped" : ""}`}>
          {/* Front — Question */}
          <div className="card-front">
            <div className="card-eyebrow">Question</div>
            <div className="card-body">{card.question}</div>
            <div className="card-source">pulled from {card.pageTitle}</div>
          </div>
          {/* Back — Answer */}
          <div className="card-back">
            <div className="card-eyebrow">Answer</div>
            <div className="card-body">{card.answer}</div>
            <div className="card-source">pulled from {card.pageTitle}</div>
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: "4px" }}>
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          aria-label="Previous card"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "18px",
            color: currentIndex === 0 ? "var(--fg-faint)" : "var(--fg-muted)",
            background: "transparent",
            border: "none",
            cursor: currentIndex === 0 ? "not-allowed" : "pointer",
            lineHeight: 1,
            padding: "4px 8px",
          }}
        >
          ←
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === cards.length - 1}
          aria-label="Next card"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "18px",
            color: currentIndex === cards.length - 1 ? "var(--fg-faint)" : "var(--fg-muted)",
            background: "transparent",
            border: "none",
            cursor: currentIndex === cards.length - 1 ? "not-allowed" : "pointer",
            lineHeight: 1,
            padding: "4px 8px",
          }}
        >
          →
        </button>
      </div>

      {/* Got / Miss buttons — only shown when flipped */}
      {isFlipped && (
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => handleRate(0)}
            style={{
              flex: 1,
              padding: "8px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-11)",
              color: "var(--danger)",
              background: "color-mix(in srgb, var(--danger) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
            }}
          >
            Miss
          </button>
          <button
            onClick={() => handleRate(1)}
            style={{
              flex: 1,
              padding: "8px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-11)",
              color: "var(--success)",
              background: "color-mix(in srgb, var(--success) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
            }}
          >
            Got
          </button>
        </div>
      )}
    </div>
  );
}

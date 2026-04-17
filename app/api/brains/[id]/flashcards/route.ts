import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  readAllPages,
  readFlashcards,
  appendFlashcards,
  appendLog,
  appendTokenUsage,
  type Flashcard,
} from "@/lib/wiki-fs";
import {
  generateFlashcards,
  generateBrainFlashcards,
} from "@/lib/compiler";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }
    const deck = readFlashcards(brain.path);
    return NextResponse.json(deck);
  } catch (error: any) {
    console.error("Flashcards GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to read flashcards" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const body = await request.json();
    const { pageId, count } = body;

    const pages = readAllPages(brain.path);
    let rawCards: Array<{
      question: string;
      answer: string;
      pageSource?: string;
      pageTitle?: string;
    }>;
    let usage;

    if (pageId) {
      const page = pages.find((p) => p.id === pageId);
      if (!page) {
        return NextResponse.json(
          { error: "Page not found" },
          { status: 404 }
        );
      }
      const result = await generateFlashcards(
        page.content,
        page.title,
        page.id,
        count || 8
      );
      rawCards = result.result.map((c) => ({
        ...c,
        pageSource: page.id,
        pageTitle: page.title,
      }));
      usage = result.usage;
    } else {
      const result = await generateBrainFlashcards(pages, count || 30);
      rawCards = result.result;
      usage = result.usage;
    }

    const now = new Date().toISOString();
    const newCards: Flashcard[] = rawCards.map((c, i) => ({
      id: `fc-${Date.now().toString(36)}-${i}`,
      question: c.question,
      answer: c.answer,
      pageSource: c.pageSource || "",
      pageTitle: c.pageTitle || "",
      created: now,
      lastReviewed: null,
      confidence: 0,
      reviewCount: 0,
      streak: 0,
    }));

    appendFlashcards(brain.path, newCards);
    appendTokenUsage(brain.path, "flashcard", usage);
    appendLog(
      brain.path,
      "flashcard",
      `Generated ${newCards.length} flashcards${pageId ? ` from page: ${pageId}` : " (whole brain)"}`
    );

    return NextResponse.json({ cards: newCards, count: newCards.length });
  } catch (error: any) {
    console.error("Flashcards POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate flashcards" },
      { status: 500 }
    );
  }
}

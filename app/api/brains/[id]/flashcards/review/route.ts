import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import { updateFlashcardReview } from "@/lib/wiki-fs";

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
    const { cardId, confidence } = body;

    if (!cardId || confidence === undefined) {
      return NextResponse.json(
        { error: "cardId and confidence are required" },
        { status: 400 }
      );
    }

    updateFlashcardReview(brain.path, cardId, confidence);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Flashcard review error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to record review" },
      { status: 500 }
    );
  }
}

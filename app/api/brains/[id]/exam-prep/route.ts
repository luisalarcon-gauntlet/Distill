import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  readAllPages,
  readFlashcards,
  readExamSessions,
  upsertExamSession,
  appendLog,
  appendTokenUsage,
  type ExamPrepSession,
  type PracticeQuestion,
} from "@/lib/wiki-fs";
import { generateExamPrep } from "@/lib/compiler";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }
    const sessions = readExamSessions(brain.path);
    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("Exam prep GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to read exam sessions" },
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
    const { title, examDate, scope } = body;

    if (!title || !examDate || !scope || !Array.isArray(scope)) {
      return NextResponse.json(
        { error: "title, examDate, and scope[] are required" },
        { status: 400 }
      );
    }

    const pages = readAllPages(brain.path);
    const flashcardDeck = readFlashcards(brain.path);

    const { result, usage } = await generateExamPrep(
      pages,
      flashcardDeck,
      title,
      examDate,
      scope
    );

    const now = new Date().toISOString();
    const session: ExamPrepSession = {
      id: `exam-${Date.now().toString(36)}`,
      title,
      examDate,
      created: now,
      updated: now,
      scope,
      conceptChecklist: result.conceptChecklist,
      studyPlan: result.studyPlan,
      practiceQuestions: result.practiceQuestions.map(
        (q, i): PracticeQuestion => ({
          id: `pq-${Date.now().toString(36)}-${i}`,
          question: q.question,
          expectedAnswer: q.expectedAnswer,
          difficulty: q.difficulty,
          relatedConcepts: q.relatedConcepts,
          attempted: false,
          userAnswer: null,
        })
      ),
      status: "active",
    };

    upsertExamSession(brain.path, session);
    appendTokenUsage(brain.path, "exam-prep", usage);
    appendLog(
      brain.path,
      "exam-prep",
      `Created exam prep: "${title}" (${examDate}, ${scope.length} pages in scope)`
    );

    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Exam prep POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create exam prep" },
      { status: 500 }
    );
  }
}

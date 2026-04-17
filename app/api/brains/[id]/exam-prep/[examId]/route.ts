import { NextResponse } from "next/server";
import { getBrain } from "@/lib/config";
import {
  readExamSessions,
  upsertExamSession,
} from "@/lib/wiki-fs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; examId: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }
    const sessions = readExamSessions(brain.path);
    const session = sessions.find((s) => s.id === params.examId);
    if (!session) {
      return NextResponse.json(
        { error: "Exam session not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Exam session GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to read exam session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; examId: string } }
) {
  try {
    const brain = getBrain(params.id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const sessions = readExamSessions(brain.path);
    const session = sessions.find((s) => s.id === params.examId);
    if (!session) {
      return NextResponse.json(
        { error: "Exam session not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Update concept checklist
    if (body.conceptChecklist) {
      session.conceptChecklist = body.conceptChecklist;
    }

    // Toggle a study plan day completion
    if (
      body.studyPlanDayIndex !== undefined &&
      body.completed !== undefined
    ) {
      const day = session.studyPlan[body.studyPlanDayIndex];
      if (day) {
        day.completed = body.completed;
      }
    }

    // Record a practice question attempt
    if (body.practiceQuestionId && body.userAnswer !== undefined) {
      const q = session.practiceQuestions.find(
        (pq) => pq.id === body.practiceQuestionId
      );
      if (q) {
        q.attempted = true;
        q.userAnswer = body.userAnswer;
      }
    }

    // Update status
    if (body.status) {
      session.status = body.status;
    }

    upsertExamSession(brain.path, session);

    return NextResponse.json(session);
  } catch (error: any) {
    console.error("Exam session PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update exam session" },
      { status: 500 }
    );
  }
}

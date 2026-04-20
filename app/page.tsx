"use client";

import { useState } from "react";
import { Screen } from "@/components/shared/types";
import { DashboardScreen } from "@/components/dashboard/DashboardScreen";
import { SyllabusImport } from "@/components/syllabus/SyllabusImport";
import { CourseViewer } from "@/components/course/CourseViewer";
import { FlashcardReview } from "@/components/flashcard/FlashcardReview";

// WikiApp.tsx is preserved for Phase 6 audit but no longer serves any screen.
// Decomposed into: DashboardScreen, SyllabusImport, CourseViewer (+ CourseSidebar, AddSourcesModal, AssignmentPanel)

export default function Home() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);

  function handleNavigate(nextScreen: Screen, brainId?: string) {
    setActiveBrainId(brainId ?? null);
    setScreen(nextScreen);
  }

  if (screen === "import") {
    return <SyllabusImport onNavigate={handleNavigate} />;
  }

  if (screen === "course" && activeBrainId) {
    return <CourseViewer brainId={activeBrainId} onNavigate={handleNavigate} />;
  }

  if (screen === "flashcards" && activeBrainId) {
    return <FlashcardReview brainId={activeBrainId} onNavigate={handleNavigate} />;
  }

  // Default: dashboard (covers "dashboard" and any screen not yet implemented)
  return <DashboardScreen onNavigate={handleNavigate} />;
}

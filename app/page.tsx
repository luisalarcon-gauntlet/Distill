"use client";

import { useState } from "react";
import { Screen } from "@/components/shared/types";
import { DashboardScreen } from "@/components/dashboard/DashboardScreen";
import { SyllabusImport } from "@/components/syllabus/SyllabusImport";

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

  // Default: dashboard (covers "dashboard" and any screen not yet implemented)
  // activeBrainId is stored for Phase 4 (course viewer) to use
  return <DashboardScreen onNavigate={handleNavigate} />;
}

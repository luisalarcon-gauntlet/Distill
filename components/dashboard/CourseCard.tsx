"use client";

import { useState } from "react";
import { BrainConfig, COURSE_COLORS } from "@/components/shared/types";

// T-02-04 mitigation: only inject colors that are known COURSE_COLORS hex values
const VALID_COURSE_COLOR_VALUES = new Set(Object.values(COURSE_COLORS));

function resolveSafeAccentColor(courseColor?: string): string | undefined {
  if (!courseColor) return undefined;
  if (VALID_COURSE_COLOR_VALUES.has(courseColor as (typeof COURSE_COLORS)[keyof typeof COURSE_COLORS])) {
    return courseColor;
  }
  return undefined;
}

interface CourseCardProps {
  brain: BrainConfig;
  pageCount: number;
  onClick: () => void;
}

export function CourseCard({ brain, pageCount, onClick }: CourseCardProps) {
  const [hovered, setHovered] = useState(false);

  const safeAccentColor = resolveSafeAccentColor(brain.courseColor);
  // Fallback to var(--border) when no valid courseColor
  const accentBorder = safeAccentColor
    ? `3px solid ${safeAccentColor}`
    : "3px solid var(--border)";

  // Derive short path without importing path (client-side safe)
  const shortPath = brain.path.split("/").slice(-2).join("/");
  const codeLabel = brain.courseCode || brain.name;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--surface-2)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: accentBorder,
        borderRadius: "var(--r-md)",
        padding: "12px",
        cursor: "pointer",
        transition: "background-color 0.12s ease",
      }}
    >
      {/* Top row: course code + semester */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-10)",
            color: "var(--fg-muted)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          {codeLabel}
        </span>
        {brain.semester && (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-11)",
              color: "var(--fg-faint)",
            }}
          >
            {brain.semester}
          </span>
        )}
      </div>

      {/* Second row: course name */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-13)",
          color: "var(--fg-strong)",
          marginTop: "4px",
        }}
      >
        {brain.name}
      </div>

      {/* Bottom row: page count + path hint */}
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-11)",
          color: "var(--fg-faint)",
          marginTop: "6px",
        }}
      >
        {pageCount} {pageCount === 1 ? "page" : "pages"} &middot; {shortPath}
      </div>
    </div>
  );
}

interface NewCourseCardProps {
  onClick: () => void;
}

export function NewCourseCard({ onClick }: NewCourseCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--surface)" : "transparent",
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-md)",
        padding: "12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "82px",
        transition: "background-color 0.12s ease",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-12)",
          color: "var(--fg-faint)",
        }}
      >
        + New course
      </span>
    </div>
  );
}

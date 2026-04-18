"use client";

import { BrainConfig } from "@/components/shared/types";

interface WeekAheadSidebarProps {
  brains: BrainConfig[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function WeekAheadSidebar({ brains }: WeekAheadSidebarProps) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Sidebar header */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-11)",
          color: "var(--fg-muted)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          padding: "16px 16px 8px",
        }}
      >
        Week Ahead
      </div>

      {brains.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-11)",
            color: "var(--fg-faint)",
            margin: "16px",
            lineHeight: 1.5,
          }}
        >
          Import a syllabus to populate your week.
        </p>
      ) : (
        days.map((day, i) => {
          const isToday = i === 0;
          const dayLabel = DAY_LABELS[day.getDay()];
          const dateNum = day.getDate();

          return (
            <div
              key={i}
              style={{
                borderLeft: isToday ? "2px solid var(--accent-25)" : "2px solid transparent",
                padding: "6px 16px",
              }}
            >
              {/* Day label row */}
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-11)",
                  color: isToday ? "var(--fg-strong)" : "var(--fg-muted)",
                }}
              >
                {dayLabel} {dateNum}
              </div>
              {/* Placeholder content until Phase 4 exam prep sessions */}
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-10)",
                  color: "var(--fg-faint)",
                  marginTop: "2px",
                }}
              >
                &mdash;
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

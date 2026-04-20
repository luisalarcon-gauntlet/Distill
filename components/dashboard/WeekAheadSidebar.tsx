"use client";

import { BrainConfig, COURSE_COLORS } from "@/components/shared/types";
import { Icon } from "@/components/shared/Icon";

interface WeekAheadSidebarProps {
  brains: BrainConfig[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const COLOR_VALUES = Object.values(COURSE_COLORS);

interface AgendaItem {
  courseName: string;
  courseColor: string;
  event: string;
  type: string;
}

export function WeekAheadSidebar({ brains }: WeekAheadSidebarProps) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  // Build agenda from all brains' deadlines
  const agendaByDate = new Map<string, AgendaItem[]>();

  brains.forEach((brain, brainIdx) => {
    const color = brain.courseColor
      ? (COLOR_VALUES.includes(brain.courseColor as any) ? brain.courseColor : COLOR_VALUES[brainIdx % COLOR_VALUES.length])
      : COLOR_VALUES[brainIdx % COLOR_VALUES.length];

    for (const dl of brain.deadlines || []) {
      if (!dl.date) continue;
      const existing = agendaByDate.get(dl.date) || [];
      existing.push({
        courseName: brain.courseCode || brain.name,
        courseColor: color,
        event: dl.event,
        type: dl.type,
      });
      agendaByDate.set(dl.date, existing);
    }
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
          const dateKey = day.toISOString().split("T")[0];
          const items = agendaByDate.get(dateKey) || [];

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
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-11)",
                  color: isToday ? "var(--fg-strong)" : "var(--fg-muted)",
                }}
              >
                <Icon name="calendar" size={12} />
                {dayLabel} {dateNum}
              </div>

              {/* Agenda items or placeholder */}
              {items.length > 0 ? (
                items.map((item, j) => (
                  <div
                    key={j}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "3px",
                      padding: "2px 0",
                    }}
                  >
                    <div style={{
                      width: 2, height: 14, borderRadius: 1,
                      background: item.courseColor, flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-10)",
                      color: item.courseColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      flexShrink: 0,
                    }}>
                      {item.courseName}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-11)",
                      color: "var(--fg)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {item.event}
                    </span>
                  </div>
                ))
              ) : (
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
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

"use client";

import { useReducer, useRef, useEffect } from "react";
import type { Screen } from "@/components/shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Inline — do NOT import from lib/ (no cross-layer imports per architecture constraints)
interface CurriculumStructure {
  courseName: string;
  courseCode: string | null;
  instructor: string | null;
  semester: string | null;
  units: Array<{
    title: string;
    lectures: Array<{ number: number; title: string; topics: string[] }>;
  }>;
}

interface EditableFields {
  courseName: string;
  courseCode: string;
  instructor: string;
  semester: string;
}

type ImportPhase =
  | { step: "idle" }
  | { step: "uploading"; file: File }
  | { step: "extracting"; file: File }
  | { step: "reviewing"; file: File; curriculum: CurriculumStructure; edited: EditableFields }
  | { step: "creating"; file: File; edited: EditableFields }
  | { step: "done" }
  | { step: "error"; message: string };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: "DROP_FILE"; file: File }
  | { type: "START_EXTRACT" }
  | { type: "EXTRACT_SUCCESS"; curriculum: CurriculumStructure }
  | { type: "EDIT_FIELD"; field: keyof EditableFields; value: string }
  | { type: "EXTRACT_ERROR"; message: string }
  | { type: "START_CREATE" }
  | { type: "CREATE_ERROR"; message: string }
  | { type: "RESET" };

function editableFromCurriculum(c: CurriculumStructure): EditableFields {
  return {
    courseName: c.courseName ?? "",
    courseCode: c.courseCode ?? "",
    instructor: c.instructor ?? "",
    semester: c.semester ?? "",
  };
}

function reducer(state: ImportPhase, action: Action): ImportPhase {
  switch (action.type) {
    case "DROP_FILE":
      return { step: "uploading", file: action.file };

    case "START_EXTRACT":
      if (state.step !== "uploading") return state;
      return { step: "extracting", file: state.file };

    case "EXTRACT_SUCCESS":
      if (state.step !== "extracting") return state;
      return {
        step: "reviewing",
        file: state.file,
        curriculum: action.curriculum,
        edited: editableFromCurriculum(action.curriculum),
      };

    case "EDIT_FIELD":
      if (state.step !== "reviewing") return state;
      return {
        ...state,
        edited: { ...state.edited, [action.field]: action.value },
      };

    case "EXTRACT_ERROR":
      return { step: "error", message: action.message };

    case "START_CREATE":
      if (state.step !== "reviewing") return state;
      return { step: "creating", file: state.file, edited: state.edited };

    case "CREATE_ERROR":
      if (state.step !== "creating") return state;
      return { step: "error", message: action.message };

    case "RESET":
      return { step: "idle" };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Creating-phase progress messages
// ---------------------------------------------------------------------------

const CREATING_MESSAGES = [
  "Saving your PDF...",
  "Skimming syllabus...",
  "Compiling your notebook...",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SyllabusImportProps {
  onNavigate: (screen: Screen, brainId?: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyllabusImport({ onNavigate }: SyllabusImportProps) {
  const [phase, dispatch] = useReducer(reducer, { step: "idle" });
  const [isDragging, setIsDragging] = useReducerBool(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultDirectoryRef = useRef<string>("/tmp/distill");
  const [creatingMsgIdx, setCreatingMsgIdx] = useReducerNumber(0);

  // ---------------------------------------------------------------------------
  // Fetch default directory on mount via /api/browse
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function fetchDefaultDir() {
      try {
        const res = await fetch("/api/browse");
        if (res.ok) {
          const data = await res.json();
          // /api/browse GET returns { current, parent, dirs }
          if (typeof data.current === "string" && data.current) {
            defaultDirectoryRef.current = data.current;
          }
        }
      } catch {
        // Fall back to /tmp/distill — safe for local-first app
      }
    }
    fetchDefaultDir();
  }, []);

  // ---------------------------------------------------------------------------
  // Cycle progress messages during creating phase
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase.step !== "creating") return;
    setCreatingMsgIdx(0);
    const intervalId = setInterval(() => {
      setCreatingMsgIdx((prev) => (prev + 1) % CREATING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(intervalId);
  }, [phase.step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Parse trigger — called immediately after DROP_FILE
  // ---------------------------------------------------------------------------
  async function triggerParse(file: File) {
    dispatch({ type: "START_EXTRACT" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/syllabus/parse", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        dispatch({
          type: "EXTRACT_ERROR",
          message: data?.error ?? `Server error (${res.status})`,
        });
        return;
      }

      dispatch({ type: "EXTRACT_SUCCESS", curriculum: data.curriculum });
    } catch (err: any) {
      dispatch({
        type: "EXTRACT_ERROR",
        message: err?.message ?? "Network error — please try again.",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Create notebook — posts to /api/brains/upload
  // ---------------------------------------------------------------------------
  async function handleConfirm() {
    if (phase.step !== "reviewing") return;

    const { file, edited } = phase;
    dispatch({ type: "START_CREATE" });

    const formData = new FormData();
    formData.append("name", edited.courseName.trim() || "Untitled Course");
    formData.append("topic", edited.instructor.trim() || edited.courseName.trim());
    formData.append("directory", defaultDirectoryRef.current);
    formData.append("files", file);
    formData.append("courseCode", edited.courseCode.trim());
    formData.append("semester", edited.semester.trim());

    try {
      const res = await fetch("/api/brains/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        dispatch({
          type: "CREATE_ERROR",
          message: data?.error ?? `Server error (${res.status})`,
        });
        return;
      }

      // Success — navigate back to dashboard; the brains list will reload
      onNavigate("dashboard");
    } catch (err: any) {
      dispatch({
        type: "CREATE_ERROR",
        message: err?.message ?? "Network error — please try again.",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Drop zone handlers
  // ---------------------------------------------------------------------------
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf") && !file.type.startsWith("application/pdf")) {
      dispatch({ type: "EXTRACT_ERROR", message: "Only PDF files are accepted." });
      return;
    }

    dispatch({ type: "DROP_FILE", file });
    triggerParse(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    dispatch({ type: "DROP_FILE", file });
    triggerParse(file);
  }

  // ---------------------------------------------------------------------------
  // Derived values for review panel
  // ---------------------------------------------------------------------------
  const lectureCount =
    phase.step === "reviewing"
      ? phase.curriculum.units.flatMap((u) => u.lectures).length
      : 0;

  // ---------------------------------------------------------------------------
  // Creating phase UI
  // ---------------------------------------------------------------------------
  if (phase.step === "creating") {
    return (
      <>
        <style>{`
          @keyframes progress-indeterminate {
            0%   { transform: translateX(-100%); width: 50%; }
            100% { transform: translateX(300%); width: 50%; }
          }
        `}</style>
        <div
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            padding: "24px",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div
            style={{
              marginTop: "80px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "var(--text-13)",
                color: "var(--fg-muted)",
                fontFamily: "var(--font-mono)",
                marginBottom: "16px",
              }}
            >
              {CREATING_MESSAGES[creatingMsgIdx]}
            </div>

            {/* Indeterminate progress bar */}
            <div
              style={{
                background: "var(--border)",
                height: "2px",
                borderRadius: "1px",
                overflow: "hidden",
                position: "relative",
                maxWidth: "320px",
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  background: "var(--accent)",
                  height: "100%",
                  position: "absolute",
                  animation: "progress-indeterminate 2s linear infinite",
                }}
              />
            </div>

            <div
              style={{
                marginTop: "12px",
                fontSize: "var(--text-11)",
                color: "var(--fg-faint)",
                fontFamily: "var(--font-mono)",
              }}
            >
              This takes 30–90 seconds
            </div>
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render (idle / uploading / extracting / reviewing / error)
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Keyframe for "Skimming..." pulse animation — no inline hex */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .syllabus-pulse {
          animation: pulse 1.6s ease-in-out infinite;
        }
      `}</style>

      <div
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          padding: "24px",
          fontFamily: "var(--font-mono)",
        }}
      >
        {/* Screen label + back link row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              fontSize: "var(--text-10)",
              color: "var(--fg-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              fontFamily: "var(--font-mono)",
            }}
          >
            Import syllabus
          </div>
          <button
            onClick={() => onNavigate("dashboard")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--text-11)",
              fontFamily: "var(--font-mono)",
              color: "var(--accent)",
              padding: "0",
            }}
          >
            &larr; Back
          </button>
        </div>

        {/* Drop zone — shrinks to passive strip when reviewing */}
        {phase.step !== "reviewing" ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "10px",
              padding: "26px",
              textAlign: "center",
              transition: "border-color 0.15s var(--ease)",
              background: isDragging ? "var(--accent-05)" : "transparent",
            }}
          >
            {phase.step === "extracting" ? (
              /* Loading state */
              <div
                className="syllabus-pulse"
                style={{
                  fontSize: "var(--text-13)",
                  color: "var(--fg-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Skimming your syllabus...
              </div>
            ) : (
              <>
                {/* Plus icon — hidden while dragging */}
                {!isDragging && (
                  <div
                    style={{
                      fontSize: "28px",
                      color: "var(--fg-muted)",
                      lineHeight: 1,
                      marginBottom: "6px",
                    }}
                  >
                    +
                  </div>
                )}

                <div
                  style={{
                    fontSize: "var(--text-13)",
                    color: "var(--fg-strong)",
                    marginBottom: "6px",
                  }}
                >
                  Drop your syllabus here
                </div>

                <div
                  style={{
                    fontSize: "var(--text-11)",
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  PDF — we&apos;ll extract your readings and schedule
                </div>

                {/* Fallback file picker */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: "none" }}
                  onChange={handleFileInput}
                />
                <div style={{ marginTop: "10px" }}>
                  <label
                    htmlFor="syllabus-file-input"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      fontSize: "var(--text-11)",
                      fontFamily: "var(--font-mono)",
                      color: "var(--accent)",
                      cursor: "pointer",
                    }}
                  >
                    or click to browse
                  </label>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Passive strip when reviewing */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `1px dashed var(--border)`,
              borderRadius: "6px",
              padding: "10px 14px",
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={handleFileInput}
            />
            <span
              style={{
                fontSize: "var(--text-11)",
                fontFamily: "var(--font-mono)",
                color: "var(--fg-faint)",
              }}
            >
              Drop another file to replace
            </span>
          </div>
        )}

        {/* Error state */}
        {phase.step === "error" && (
          <div style={{ marginTop: "12px" }}>
            <span
              style={{
                fontSize: "var(--text-12)",
                fontFamily: "var(--font-mono)",
                color: "var(--danger)",
              }}
            >
              {phase.message}
            </span>
            {" "}
            <button
              onClick={() => dispatch({ type: "RESET" })}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "var(--text-12)",
                fontFamily: "var(--font-mono)",
                color: "var(--accent)",
                padding: "0",
                textDecoration: "underline",
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Review panel */}
        {phase.step === "reviewing" && (
          <div
            style={{
              marginTop: "14px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "12px 14px",
            }}
          >
            {/* "Detected" label in success green */}
            <div
              style={{
                fontSize: "var(--text-10)",
                fontFamily: "var(--font-mono)",
                color: "var(--success)",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: "8px",
              }}
            >
              Detected
            </div>

            {/* Stats row: 3 columns */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
              {/* Readings (lecture count) */}
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-strong)",
                  }}
                >
                  {lectureCount > 0 ? lectureCount : "—"}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-10)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginTop: "2px",
                  }}
                >
                  readings
                </div>
              </div>

              {/* Problem sets — not in CurriculumStructure yet */}
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-strong)",
                  }}
                >
                  —
                </div>
                <div
                  style={{
                    fontSize: "var(--text-10)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginTop: "2px",
                  }}
                >
                  problem sets
                </div>
              </div>

              {/* Exams — not in CurriculumStructure yet */}
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-strong)",
                  }}
                >
                  —
                </div>
                <div
                  style={{
                    fontSize: "var(--text-10)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginTop: "2px",
                  }}
                >
                  exams
                </div>
              </div>
            </div>

            {/* Editable fields section */}
            <div
              style={{
                fontSize: "var(--text-10)",
                fontFamily: "var(--font-mono)",
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: "10px",
              }}
            >
              Course details
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <FieldInput
                label="Course name"
                value={phase.edited.courseName}
                placeholder="e.g. Introduction to Computer Science"
                onChange={(v) => dispatch({ type: "EDIT_FIELD", field: "courseName", value: v })}
              />
              <FieldInput
                label="Course code"
                value={phase.edited.courseCode}
                placeholder="e.g. CS 101"
                onChange={(v) => dispatch({ type: "EDIT_FIELD", field: "courseCode", value: v })}
              />
              <FieldInput
                label="Instructor"
                value={phase.edited.instructor}
                placeholder="e.g. Prof. Smith"
                onChange={(v) => dispatch({ type: "EDIT_FIELD", field: "instructor", value: v })}
              />
              <FieldInput
                label="Semester"
                value={phase.edited.semester}
                placeholder="e.g. Fall 2025"
                onChange={(v) => dispatch({ type: "EDIT_FIELD", field: "semester", value: v })}
              />
            </div>

            {/* Create notebook button */}
            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                disabled={phase.edited.courseName.trim() === ""}
                onClick={handleConfirm}
                style={{
                  background:
                    phase.edited.courseName.trim() === ""
                      ? "var(--border)"
                      : "var(--accent)",
                  color:
                    phase.edited.courseName.trim() === ""
                      ? "var(--fg-faint)"
                      : "var(--bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-12)",
                  padding: "8px 16px",
                  borderRadius: "var(--r-md)",
                  border: "none",
                  cursor:
                    phase.edited.courseName.trim() === "" ? "not-allowed" : "pointer",
                  transition: "background 0.15s var(--ease)",
                }}
              >
                Create notebook &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// FieldInput — a labelled text input using CSS vars only
// ---------------------------------------------------------------------------
interface FieldInputProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

function FieldInput({ label, value, placeholder, onChange }: FieldInputProps) {
  return (
    <div>
      <div
        style={{
          fontSize: "var(--text-10)",
          fontFamily: "var(--font-mono)",
          color: "var(--fg-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          padding: "6px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-12)",
          color: "var(--fg)",
          borderRadius: "var(--r-sm)",
          width: "100%",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny useState-compatible boolean toggle using useReducer
// (avoids importing useState separately; keeps dispatch-only pattern)
// ---------------------------------------------------------------------------
function useReducerBool(
  initial: boolean
): [boolean, (next: boolean) => void] {
  const [val, dispatch] = useReducer((_: boolean, next: boolean) => next, initial);
  return [val, dispatch];
}

// ---------------------------------------------------------------------------
// Tiny useState-compatible number state using useReducer
// ---------------------------------------------------------------------------
function useReducerNumber(
  initial: number
): [number, (next: number | ((prev: number) => number)) => void] {
  const [val, dispatch] = useReducer(
    (prev: number, next: number | ((prev: number) => number)) =>
      typeof next === "function" ? next(prev) : next,
    initial
  );
  return [val, dispatch];
}

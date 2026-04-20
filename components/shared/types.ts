// Shared types for Distill undergrad pivot. All screen components import from here.

export interface CourseDeadline {
  date: string;       // YYYY-MM-DD
  event: string;      // "Problem Set 1 due", "Midterm exam", etc.
  type: "assignment" | "exam" | "project" | "lecture" | "other";
}

export interface BrainConfig {
  id: string;
  name: string;
  path: string;
  topic: string;
  created: string;
  lastOpened: string;
  courseCode?: string;
  semester?: string;
  courseColor?: string;
  deadlines?: CourseDeadline[];
}

export const COURSE_COLORS = {
  violet: "#c4a1ff",
  amber:  "#ffb86b",
  sage:   "#7ec99a",
  rose:   "#f4a3b8",
  sky:    "#8ecae6",
  citrus: "#d4d45a",
} as const;

export type CourseColorKey = keyof typeof COURSE_COLORS;

export interface WikiPage {
  id: string;
  title: string;
  type: string;
  content: string;
  links: string[];
  sources: string[];
  filepath: string;
  created: string;
  updated: string;
}

export interface LogEntry {
  date: string;
  action: string;
  detail: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  citationCount: number;
  source_api: "semantic_scholar" | "arxiv" | "openalex";
  arxivId?: string;
}

export type TokenOperation = "compile" | "ingest" | "query" | "lint" | "flashcard" | "exam-prep";

export interface OperationBreakdown {
  input: number;
  output: number;
  count: number;
}

export interface TokenSummary {
  total_input: number;
  total_output: number;
  total_tokens: number;
  by_operation: Record<TokenOperation, OperationBreakdown>;
  estimated_cost_usd: number;
  estimated_tokens_without_wiki: number;
  tokens_saved: number;
  model: string;
  provider: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  pageSource: string;
  pageTitle: string;
  created: string;
  lastReviewed: string | null;
  confidence: number;
  reviewCount: number;
  streak: number;
}

export interface ExamPrepSession {
  id: string;
  title: string;
  examDate: string;
  created: string;
  updated: string;
  scope: string[];
  conceptChecklist: Array<{
    concept: string;
    pageId: string | null;
    mastery: "not-started" | "weak" | "developing" | "strong";
    notes: string;
  }>;
  studyPlan: Array<{
    date: string;
    topics: string[];
    flashcardTarget: number;
    completed: boolean;
  }>;
  practiceQuestions: Array<{
    id: string;
    question: string;
    expectedAnswer: string;
    difficulty: "easy" | "medium" | "hard";
    relatedConcepts: string[];
    attempted: boolean;
    userAnswer: string | null;
  }>;
  status: "active" | "completed" | "archived";
}

export type Screen = "dashboard" | "import" | "course" | "flashcards" | "exam-prep";

export interface UploadStep {
  message: string;
  done: boolean;
}

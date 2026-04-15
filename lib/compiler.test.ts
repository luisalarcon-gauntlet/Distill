import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { classifyPDFs, parseSyllabus } from "./compiler";

// ---------------------------------------------------------------------------
// Helpers — mirror the mocking pattern used in llm.test.ts
// ---------------------------------------------------------------------------

function makeAnthropicResponse(
  text: string,
  inputTokens = 10,
  outputTokens = 20
) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  } as unknown as Response;
}

function stubLLMResponse(text: string, inputTokens = 10, outputTokens = 20) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        makeAnthropicResponse(text, inputTokens, outputTokens)
      )
  );
}

// ---------------------------------------------------------------------------
// Environment reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.stubEnv("OPENAI_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// classifyPDFs()
// ---------------------------------------------------------------------------

describe("classifyPDFs()", () => {
  it("returns empty array and zero usage when previews is empty", async () => {
    const { result, usage } = await classifyPDFs([]);

    expect(result).toEqual([]);
    expect(usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it("returns classifications with expected shape on well-formed LLM response", async () => {
    stubLLMResponse(
      JSON.stringify({
        classifications: [
          {
            filename: "Lec5.pdf",
            type: "lecture",
            lectureNumber: 5,
            title: "Lecture 5: Graphs",
          },
          {
            filename: "PS3.pdf",
            type: "problem-set",
            lectureNumber: null,
            title: "Problem Set 3",
          },
          {
            filename: "Syllabus.pdf",
            type: "syllabus",
            lectureNumber: null,
            title: "Course Syllabus",
          },
        ],
      }),
      42,
      99
    );

    const { result, usage } = await classifyPDFs([
      { filename: "Lec5.pdf", textPreview: "Lecture 5 notes about graphs" },
      { filename: "PS3.pdf", textPreview: "Problem 1. Show that ..." },
      { filename: "Syllabus.pdf", textPreview: "Course outline and schedule" },
    ]);

    expect(usage).toEqual({ input_tokens: 42, output_tokens: 99 });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      filename: "Lec5.pdf",
      type: "lecture",
      lectureNumber: 5,
      title: "Lecture 5: Graphs",
    });
    expect(result[1].type).toBe("problem-set");
    expect(result[1].lectureNumber).toBeNull();
    expect(result[2].type).toBe("syllabus");
  });

  it("preserves input order in output", async () => {
    // LLM returns entries in reversed order — we should still emit in input order.
    stubLLMResponse(
      JSON.stringify({
        classifications: [
          { filename: "b.pdf", type: "lecture", lectureNumber: 2, title: "B" },
          { filename: "a.pdf", type: "lecture", lectureNumber: 1, title: "A" },
        ],
      })
    );

    const { result } = await classifyPDFs([
      { filename: "a.pdf", textPreview: "" },
      { filename: "b.pdf", textPreview: "" },
    ]);

    expect(result.map((r) => r.filename)).toEqual(["a.pdf", "b.pdf"]);
    expect(result[0].lectureNumber).toBe(1);
    expect(result[1].lectureNumber).toBe(2);
  });

  it("coerces invalid type values to 'other'", async () => {
    stubLLMResponse(
      JSON.stringify({
        classifications: [
          {
            filename: "weird.pdf",
            type: "not-a-real-type",
            lectureNumber: null,
            title: "Weird",
          },
        ],
      })
    );

    const { result } = await classifyPDFs([
      { filename: "weird.pdf", textPreview: "" },
    ]);

    expect(result[0].type).toBe("other");
    expect(result[0].title).toBe("Weird");
  });

  it("falls back per-PDF when the LLM omits an input file", async () => {
    stubLLMResponse(
      JSON.stringify({
        classifications: [
          {
            filename: "covered.pdf",
            type: "lecture",
            lectureNumber: 1,
            title: "Covered",
          },
        ],
      })
    );

    const { result } = await classifyPDFs([
      { filename: "covered.pdf", textPreview: "" },
      { filename: "missed.pdf", textPreview: "" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("lecture");
    expect(result[1]).toEqual({
      filename: "missed.pdf",
      type: "other",
      lectureNumber: null,
      title: "missed.pdf",
    });
  });

  it("returns fallback array on malformed LLM response (non-JSON)", async () => {
    stubLLMResponse("sorry I cannot produce JSON for that");

    const { result, usage } = await classifyPDFs([
      { filename: "a.pdf", textPreview: "" },
      { filename: "b.pdf", textPreview: "" },
    ]);

    expect(result).toEqual([
      {
        filename: "a.pdf",
        type: "other",
        lectureNumber: null,
        title: "a.pdf",
      },
      {
        filename: "b.pdf",
        type: "other",
        lectureNumber: null,
        title: "b.pdf",
      },
    ]);
    expect(usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it("returns fallback array when LLM returns JSON without classifications field", async () => {
    stubLLMResponse(JSON.stringify({ unrelated: "shape" }));

    const { result } = await classifyPDFs([
      { filename: "a.pdf", textPreview: "" },
    ]);

    expect(result).toEqual([
      {
        filename: "a.pdf",
        type: "other",
        lectureNumber: null,
        title: "a.pdf",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// parseSyllabus()
// ---------------------------------------------------------------------------

describe("parseSyllabus()", () => {
  it("returns structured curriculum with expected shape on well-formed response", async () => {
    stubLLMResponse(
      JSON.stringify({
        courseName: "Introduction to Algorithms",
        courseCode: "6.006",
        instructor: "Erik Demaine",
        semester: "Fall 2024",
        units: [
          {
            title: "Unit 1: Foundations",
            lectures: [
              {
                number: 1,
                title: "Introduction",
                topics: ["big-O", "analysis"],
              },
              {
                number: 2,
                title: "Sorting",
                topics: ["merge sort", "quick sort"],
              },
            ],
          },
        ],
      }),
      50,
      120
    );

    const { result, usage } = await parseSyllabus(
      "Introduction to Algorithms\n6.006\nFall 2024\n..."
    );

    expect(usage).toEqual({ input_tokens: 50, output_tokens: 120 });
    expect(result.courseName).toBe("Introduction to Algorithms");
    expect(result.courseCode).toBe("6.006");
    expect(result.instructor).toBe("Erik Demaine");
    expect(result.semester).toBe("Fall 2024");
    expect(result.units).toHaveLength(1);
    expect(result.units[0].title).toBe("Unit 1: Foundations");
    expect(result.units[0].lectures).toHaveLength(2);
    expect(result.units[0].lectures[0]).toEqual({
      number: 1,
      title: "Introduction",
      topics: ["big-O", "analysis"],
    });
  });

  it("coerces null scalar fields correctly", async () => {
    stubLLMResponse(
      JSON.stringify({
        courseName: "Solo Course",
        courseCode: null,
        instructor: null,
        semester: null,
        units: [],
      })
    );

    const { result } = await parseSyllabus("some text");

    expect(result.courseName).toBe("Solo Course");
    expect(result.courseCode).toBeNull();
    expect(result.instructor).toBeNull();
    expect(result.semester).toBeNull();
    expect(result.units).toEqual([]);
  });

  it("drops lectures missing a numeric lecture number", async () => {
    stubLLMResponse(
      JSON.stringify({
        courseName: "C",
        courseCode: null,
        instructor: null,
        semester: null,
        units: [
          {
            title: "Unit",
            lectures: [
              { number: 1, title: "Good", topics: [] },
              { title: "Bad — missing number", topics: [] },
              { number: "not-a-number", title: "Also bad", topics: [] },
            ],
          },
        ],
      })
    );

    const { result } = await parseSyllabus("x");

    expect(result.units).toHaveLength(1);
    expect(result.units[0].lectures).toHaveLength(1);
    expect(result.units[0].lectures[0].number).toBe(1);
  });

  it("filters non-string topic entries", async () => {
    stubLLMResponse(
      JSON.stringify({
        courseName: "C",
        courseCode: null,
        instructor: null,
        semester: null,
        units: [
          {
            title: "U",
            lectures: [
              { number: 1, title: "L", topics: ["a", 5, "b", null, "c"] },
            ],
          },
        ],
      })
    );

    const { result } = await parseSyllabus("x");

    expect(result.units[0].lectures[0].topics).toEqual(["a", "b", "c"]);
  });

  it("returns minimal fallback on malformed (non-JSON) LLM response", async () => {
    stubLLMResponse("definitely not JSON");

    const { result, usage } = await parseSyllabus("some syllabus");

    expect(result).toEqual({
      courseName: "Untitled Course",
      courseCode: null,
      instructor: null,
      semester: null,
      units: [],
    });
    expect(usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it("returns minimal-with-fallback-name when LLM returns a non-object JSON (array)", async () => {
    stubLLMResponse(JSON.stringify(["not", "an", "object"]));

    const { result, usage } = await parseSyllabus("some syllabus");

    expect(result.courseName).toBe("Untitled Course");
    expect(result.units).toEqual([]);
    // This path DID make an LLM call, so usage is real (not zero).
    expect(usage.input_tokens).toBeGreaterThan(0);
  });

  it("uses 'Untitled Course' fallback when courseName is missing or empty", async () => {
    stubLLMResponse(
      JSON.stringify({
        courseName: "",
        courseCode: null,
        instructor: null,
        semester: null,
        units: [],
      })
    );

    const { result } = await parseSyllabus("x");

    expect(result.courseName).toBe("Untitled Course");
  });
});

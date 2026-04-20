/**
 * Tests for Plan 02-01: Course data model extension
 *
 * Covers:
 *  1. BrainConfig interface has courseCode?, semester?, courseColor? fields
 *  2. COURSE_COLORS constant has all 6 named hex values
 *  3. CourseColorKey type is derived from COURSE_COLORS
 *  4. lib/config.ts BrainConfig has the same three optional fields
 *  5. POST /api/brains validation: courseColor, courseCode, semester length/type checks
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// 1. components/shared/types.ts — BrainConfig + COURSE_COLORS
// ---------------------------------------------------------------------------

describe("components/shared/types.ts — BrainConfig course fields", () => {
  it("BrainConfig type accepts courseCode, semester, courseColor as optional strings", async () => {
    const { } = await import("../components/shared/types");
    // TypeScript structural check: if fields are missing from BrainConfig,
    // this object assignment would fail at compile time. At runtime we verify
    // the import succeeds and the object can be constructed with the new fields.
    const brain: import("../components/shared/types").BrainConfig = {
      id: "test-abc",
      name: "Test Course",
      path: "/some/path",
      topic: "Algebra",
      created: "2025-01-01T00:00:00.000Z",
      lastOpened: "2025-01-01T00:00:00.000Z",
      courseCode: "MATH 101",
      semester: "Fall 2025",
      courseColor: "violet",
    };
    expect(brain.courseCode).toBe("MATH 101");
    expect(brain.semester).toBe("Fall 2025");
    expect(brain.courseColor).toBe("violet");
  });

  it("BrainConfig is valid without optional course fields", async () => {
    const brain: import("../components/shared/types").BrainConfig = {
      id: "test-abc",
      name: "Test Course",
      path: "/some/path",
      topic: "Algebra",
      created: "2025-01-01T00:00:00.000Z",
      lastOpened: "2025-01-01T00:00:00.000Z",
    };
    expect(brain.courseCode).toBeUndefined();
    expect(brain.semester).toBeUndefined();
    expect(brain.courseColor).toBeUndefined();
  });
});

describe("components/shared/types.ts — COURSE_COLORS", () => {
  it("exports COURSE_COLORS with all 6 named color keys", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS).toBeDefined();
    expect(Object.keys(COURSE_COLORS)).toHaveLength(6);
    expect(Object.keys(COURSE_COLORS)).toEqual(
      expect.arrayContaining(["violet", "amber", "sage", "rose", "sky", "citrus"])
    );
  });

  it("violet is #c4a1ff", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS.violet).toBe("#c4a1ff");
  });

  it("amber is #ffb86b", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS.amber).toBe("#ffb86b");
  });

  it("sage is #7ec99a", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS.sage).toBe("#7ec99a");
  });

  it("rose is #f4a3b8", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS.rose).toBe("#f4a3b8");
  });

  it("sky is #8ecae6", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS.sky).toBe("#8ecae6");
  });

  it("citrus is #d4d45a", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    expect(COURSE_COLORS.citrus).toBe("#d4d45a");
  });

  it("COURSE_COLORS is immutable (as const)", async () => {
    const { COURSE_COLORS } = await import("../components/shared/types");
    // TypeScript 'as const' makes the type readonly. At runtime, verify
    // that the object values are correct hex strings (not empty/undefined).
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const [key, value] of Object.entries(COURSE_COLORS)) {
      expect(value).toMatch(hexPattern);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. lib/config.ts — BrainConfig has the same three optional fields
// ---------------------------------------------------------------------------

describe("lib/config.ts — BrainConfig course fields", () => {
  it("BrainConfig in lib/config.ts accepts courseCode, semester, courseColor", async () => {
    // BrainConfig is a type-only export — we verify the shape at the type level.
    // At runtime, verify that a brain object with new fields can be constructed.
    const brain: import("./config").BrainConfig = {
      id: "lib-test",
      name: "Lib Test Brain",
      path: "/lib/test/path",
      topic: "CS 101",
      created: "2025-01-01T00:00:00.000Z",
      lastOpened: "2025-01-01T00:00:00.000Z",
      courseCode: "CS 101",
      semester: "Spring 2025",
      courseColor: "sky",
    };
    expect(brain.courseCode).toBe("CS 101");
    expect(brain.semester).toBe("Spring 2025");
    expect(brain.courseColor).toBe("sky");
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/brains input validation (threat model T-02-01, T-02-02)
// ---------------------------------------------------------------------------

describe("POST /api/brains — courseColor validation (T-02-01)", () => {
  it("rejects courseColor that is not a string", async () => {
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        courseColor: 12345,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("rejects courseColor longer than 20 characters", async () => {
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        courseColor: "this-is-way-too-long-for-a-color",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("accepts a valid courseColor within 20 chars", async () => {
    // This test will partially fail because directory /tmp may trigger path checks,
    // but it must NOT fail with a 400 due to courseColor validation.
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        courseColor: "#c4a1ff",
      }),
    });
    const res = await POST(req);
    // Should not be a 400 due to courseColor; may be 403 (path) or 500 (fs)
    expect(res.status).not.toBe(400);
  });
});

describe("POST /api/brains — courseCode / semester validation (T-02-02)", () => {
  it("rejects courseCode longer than 30 characters", async () => {
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        courseCode: "A".repeat(31),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("rejects semester longer than 30 characters", async () => {
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        semester: "S".repeat(31),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("accepts courseCode of exactly 30 characters", async () => {
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        courseCode: "A".repeat(30),
      }),
    });
    const res = await POST(req);
    // Should not be 400 due to courseCode validation
    expect(res.status).not.toBe(400);
  });

  it("accepts semester of exactly 30 characters", async () => {
    const { POST } = await import("../app/api/brains/route");
    const req = new Request("http://localhost/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Brain",
        directory: "/tmp",
        semester: "S".repeat(30),
      }),
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });
});

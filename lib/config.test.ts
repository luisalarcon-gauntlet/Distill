/**
 * Tests for lib/config.ts — Brain Registry Config Manager
 *
 * Strategy: mock the entire `fs` module so no reads or writes touch
 * ~/.distill/config.json or the real filesystem. An in-memory store
 * (`fakeStore`) acts as the backing "file", and `existingPaths` controls
 * which paths `existsSync` considers present.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Derive config paths (mirrors the logic in config.ts)
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), ".distill");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// ---------------------------------------------------------------------------
// In-memory state shared with the fs mock factory
// ---------------------------------------------------------------------------

/**
 * Paths that `existsSync` will report as present.
 * Tests add brain paths here to simulate them existing on disk.
 */
const existingPaths = new Set<string>();

/**
 * In-memory representation of CONFIG_PATH contents.
 * `null` means the file does not exist yet.
 */
let fakeStore: string | null = null;

// ---------------------------------------------------------------------------
// fs mock — vi.mock is hoisted by Vitest so the factory runs before any import
// ---------------------------------------------------------------------------

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn((p: string) => existingPaths.has(p)),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((_p: string, _enc: string) => {
      if (fakeStore === null) {
        const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
        throw err;
      }
      return fakeStore;
    }),
    writeFileSync: vi.fn((_p: string, data: string, _enc: string) => {
      fakeStore = data;
      existingPaths.add(CONFIG_PATH);
    }),
  },
}));

// Import the mocked `fs` so we can spy on individual methods in tests
import fs from "fs";

// Import the module under test — receives the mocked fs
import {
  generateBrainId,
  registerBrain,
  getBrain,
  listBrains,
  removeBrain,
  setLastActive,
  BrainConfig,
} from "./config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBrain(overrides: Partial<BrainConfig> = {}): BrainConfig {
  return {
    id: "test-brain-abc123",
    name: "Test Brain",
    path: "/some/path/to/brain",
    topic: "Testing",
    created: "2024-01-01T00:00:00.000Z",
    lastOpened: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Populate the in-memory store with a list of brains. */
function seedConfig(brains: BrainConfig[]): void {
  fakeStore = JSON.stringify({ brains }, null, 2);
  existingPaths.add(CONFIG_PATH);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset in-memory state
  fakeStore = null;
  existingPaths.clear();
  // CONFIG_DIR is always present so ensureConfigDir() is a no-op
  existingPaths.add(CONFIG_DIR);
  // Reset call history only (does NOT wipe mock implementations)
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore any spies created with vi.spyOn inside tests
  vi.restoreAllMocks();
  // Restore real timers if a test used fake ones
  vi.useRealTimers();
});

// ===========================================================================
// generateBrainId
// ===========================================================================

describe("generateBrainId", () => {
  it("lowercases the name", () => {
    const id = generateBrainId("HELLO");
    expect(id).toMatch(/^hello-/);
  });

  it("replaces spaces with hyphens", () => {
    const id = generateBrainId("machine learning");
    expect(id).toMatch(/^machine-learning-/);
  });

  it("collapses multiple consecutive spaces or special chars into one hyphen", () => {
    const id = generateBrainId("foo  bar   baz");
    expect(id).toMatch(/^foo-bar-baz-/);
  });

  it("strips leading and trailing hyphens from the slug portion", () => {
    const id = generateBrainId("--hello world--");
    expect(id).toMatch(/^hello-world-/);
  });

  it("removes non-alphanumeric characters", () => {
    // "C++ & Rust!" → "c" + "rust" joined by a hyphen
    const id = generateBrainId("C++ & Rust!");
    expect(id).toMatch(/^c-rust-/);
  });

  it("handles unicode by stripping non-ascii characters", () => {
    // "Résumé" → only ASCII alnum chars survive
    const id = generateBrainId("Résumé");
    // Result contains only lowercase letters, digits, and hyphens
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
  });

  it("appends a base-36 timestamp suffix after the slug", () => {
    const before = Date.now();
    const id = generateBrainId("test");
    const after = Date.now();

    const parts = id.split("-");
    const suffix = parts[parts.length - 1];
    const decoded = parseInt(suffix, 36);

    expect(decoded).toBeGreaterThanOrEqual(before);
    expect(decoded).toBeLessThanOrEqual(after);
  });

  it("produces unique IDs on repeated calls with the same name", () => {
    const id1 = generateBrainId("duplicate");
    // Advance Date.now by 1ms so the suffix differs
    vi.spyOn(Date, "now").mockReturnValueOnce(Date.now() + 1);
    const id2 = generateBrainId("duplicate");
    expect(id1).not.toBe(id2);
  });

  it("handles an empty string without throwing and returns a non-empty string", () => {
    const id = generateBrainId("");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("handles a name composed entirely of special characters without throwing", () => {
    const id = generateBrainId("!@#$%^&*()");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// registerBrain
// ===========================================================================

describe("registerBrain", () => {
  it("adds a brain to an empty registry", () => {
    const brain = makeBrain();
    registerBrain(brain);

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(1);
    expect(stored.brains[0]).toEqual(brain);
  });

  it("adds multiple distinct brains", () => {
    registerBrain(makeBrain({ id: "brain-1", name: "First" }));
    registerBrain(makeBrain({ id: "brain-2", name: "Second" }));

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(2);
  });

  it("updates an existing brain by ID without duplicating it", () => {
    const original = makeBrain({ name: "Original Name" });
    seedConfig([original]);

    const updated = { ...original, name: "Updated Name", topic: "New Topic" };
    registerBrain(updated);

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(1);
    expect(stored.brains[0].name).toBe("Updated Name");
    expect(stored.brains[0].topic).toBe("New Topic");
  });

  it("preserves other brains when updating one", () => {
    const b1 = makeBrain({ id: "brain-1", name: "First" });
    const b2 = makeBrain({ id: "brain-2", name: "Second" });
    seedConfig([b1, b2]);

    registerBrain({ ...b1, name: "First Updated" });

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(2);
    const b2Stored = stored.brains.find((b: BrainConfig) => b.id === "brain-2");
    expect(b2Stored.name).toBe("Second");
  });

  it("writes valid JSON to the store", () => {
    registerBrain(makeBrain());
    expect(() => JSON.parse(fakeStore!)).not.toThrow();
  });

  it("persists the brain's full shape (all fields present)", () => {
    const brain = makeBrain({ id: "full-shape", topic: "Philosophy" });
    registerBrain(brain);

    const stored = JSON.parse(fakeStore!);
    const saved = stored.brains[0];
    expect(saved.id).toBe("full-shape");
    expect(saved.name).toBeDefined();
    expect(saved.path).toBeDefined();
    expect(saved.topic).toBe("Philosophy");
    expect(saved.created).toBeDefined();
    expect(saved.lastOpened).toBeDefined();
  });
});

// ===========================================================================
// getBrain
// ===========================================================================

describe("getBrain", () => {
  it("returns the brain with the matching ID", () => {
    const brain = makeBrain({ id: "find-me" });
    seedConfig([brain]);
    expect(getBrain("find-me")).toEqual(brain);
  });

  it("returns null when the ID does not exist", () => {
    seedConfig([makeBrain({ id: "other" })]);
    expect(getBrain("nonexistent")).toBeNull();
  });

  it("returns null when the registry is empty", () => {
    seedConfig([]);
    expect(getBrain("anything")).toBeNull();
  });

  it("returns null when the config file does not exist yet", () => {
    // fakeStore is null so readConfig falls back to { brains: [] }
    expect(getBrain("anything")).toBeNull();
  });

  it("returns the correct brain when multiple brains exist", () => {
    const b1 = makeBrain({ id: "b1", name: "Alpha" });
    const b2 = makeBrain({ id: "b2", name: "Beta" });
    const b3 = makeBrain({ id: "b3", name: "Gamma" });
    seedConfig([b1, b2, b3]);
    expect(getBrain("b2")).toEqual(b2);
  });

  it("does not return a brain when only a prefix of its ID is provided", () => {
    seedConfig([makeBrain({ id: "brain-full-id" })]);
    expect(getBrain("brain-full")).toBeNull();
  });
});

// ===========================================================================
// listBrains
// ===========================================================================

describe("listBrains", () => {
  it("returns an empty array when no brains are registered", () => {
    seedConfig([]);
    expect(listBrains()).toEqual([]);
  });

  it("returns an empty array when the config file does not exist", () => {
    expect(listBrains()).toEqual([]);
  });

  it("returns all brains when all their paths exist on disk", () => {
    const b1 = makeBrain({ id: "b1", path: "/existing/b1" });
    const b2 = makeBrain({ id: "b2", path: "/existing/b2" });
    existingPaths.add("/existing/b1");
    existingPaths.add("/existing/b2");
    seedConfig([b1, b2]);

    const result = listBrains();
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("filters out brains whose paths do not exist on disk", () => {
    const valid = makeBrain({ id: "valid", path: "/real/path" });
    const stale = makeBrain({ id: "stale", path: "/deleted/path" });
    existingPaths.add("/real/path");
    // "/deleted/path" intentionally absent from existingPaths
    seedConfig([valid, stale]);

    const result = listBrains();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("valid");
  });

  it("returns an empty array when none of the brain paths exist on disk", () => {
    const b1 = makeBrain({ id: "b1", path: "/gone/b1" });
    const b2 = makeBrain({ id: "b2", path: "/gone/b2" });
    // Neither path added to existingPaths
    seedConfig([b1, b2]);

    expect(listBrains()).toEqual([]);
  });

  it("persists the pruned list back to disk when stale entries are removed", () => {
    const valid = makeBrain({ id: "valid", path: "/real/path" });
    const stale = makeBrain({ id: "stale", path: "/missing/path" });
    existingPaths.add("/real/path");
    seedConfig([valid, stale]);

    listBrains();

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(1);
    expect(stored.brains[0].id).toBe("valid");
  });

  it("does not rewrite the config file when no entries are stale", () => {
    const b = makeBrain({ id: "b1", path: "/real/path" });
    existingPaths.add("/real/path");
    seedConfig([b]);

    const writeSpy = vi.spyOn(fs, "writeFileSync");
    listBrains();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("preserves brain data for entries that survive filtering", () => {
    const valid = makeBrain({ id: "kept", path: "/kept/path", topic: "Physics" });
    existingPaths.add("/kept/path");
    seedConfig([valid, makeBrain({ id: "gone", path: "/gone/path" })]);

    const result = listBrains();
    expect(result[0].topic).toBe("Physics");
  });
});

// ===========================================================================
// removeBrain
// ===========================================================================

describe("removeBrain", () => {
  it("removes the brain with the matching ID", () => {
    const b1 = makeBrain({ id: "remove-me" });
    const b2 = makeBrain({ id: "keep-me" });
    seedConfig([b1, b2]);

    removeBrain("remove-me");

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(1);
    expect(stored.brains[0].id).toBe("keep-me");
  });

  it("does not crash when the ID does not exist", () => {
    seedConfig([makeBrain({ id: "existing" })]);
    expect(() => removeBrain("nonexistent")).not.toThrow();
  });

  it("does not crash when the registry is empty", () => {
    seedConfig([]);
    expect(() => removeBrain("anything")).not.toThrow();
  });

  it("does not crash when the config file does not exist yet", () => {
    // fakeStore is null — readConfig falls back to { brains: [] }
    expect(() => removeBrain("anything")).not.toThrow();
  });

  it("results in an empty registry when the only brain is removed", () => {
    seedConfig([makeBrain({ id: "only-brain" })]);
    removeBrain("only-brain");

    const stored = JSON.parse(fakeStore!);
    expect(stored.brains).toHaveLength(0);
  });

  it("persists the change to disk after removal", () => {
    seedConfig([makeBrain({ id: "b1" }), makeBrain({ id: "b2" })]);
    removeBrain("b1");

    const stored = JSON.parse(fakeStore!);
    const b1Entry = stored.brains.find((b: BrainConfig) => b.id === "b1");
    expect(b1Entry).toBeUndefined();
  });

  it("does not affect brains other than the one removed", () => {
    const b1 = makeBrain({ id: "b1", name: "First" });
    const b2 = makeBrain({ id: "b2", name: "Second" });
    const b3 = makeBrain({ id: "b3", name: "Third" });
    seedConfig([b1, b2, b3]);

    removeBrain("b2");

    const stored = JSON.parse(fakeStore!);
    const ids = stored.brains.map((b: BrainConfig) => b.id);
    expect(ids).toEqual(["b1", "b3"]);
  });
});

// ===========================================================================
// setLastActive
// ===========================================================================

describe("setLastActive", () => {
  it("updates lastOpened for the matching brain", () => {
    const brain = makeBrain({ id: "active-brain", lastOpened: "2024-01-01T00:00:00.000Z" });
    seedConfig([brain]);

    vi.useFakeTimers();
    const now = new Date("2025-06-15T12:00:00.000Z");
    vi.setSystemTime(now);

    setLastActive("active-brain");

    const stored = JSON.parse(fakeStore!);
    const updated = stored.brains.find((b: BrainConfig) => b.id === "active-brain");
    expect(updated.lastOpened).toBe(now.toISOString());
  });

  it("sets lastOpened to a valid ISO 8601 string", () => {
    const brain = makeBrain({ id: "ts-check" });
    seedConfig([brain]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-01T09:30:00.000Z"));

    setLastActive("ts-check");

    const stored = JSON.parse(fakeStore!);
    const updated = stored.brains[0];
    const parsed = new Date(updated.lastOpened);
    expect(parsed.toISOString()).toBe(updated.lastOpened);
  });

  it("does not modify other brains when updating lastOpened", () => {
    const b1 = makeBrain({ id: "b1", lastOpened: "2024-01-01T00:00:00.000Z" });
    const b2 = makeBrain({ id: "b2", lastOpened: "2024-01-01T00:00:00.000Z" });
    seedConfig([b1, b2]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
    setLastActive("b1");

    const stored = JSON.parse(fakeStore!);
    const b2After = stored.brains.find((b: BrainConfig) => b.id === "b2");
    expect(b2After.lastOpened).toBe("2024-01-01T00:00:00.000Z");
  });

  it("does not write the config when the ID does not exist", () => {
    seedConfig([makeBrain({ id: "other" })]);

    const storeBefore = fakeStore;
    setLastActive("nonexistent");

    expect(fakeStore).toBe(storeBefore);
  });

  it("does not crash when the ID does not exist", () => {
    seedConfig([makeBrain({ id: "other" })]);
    expect(() => setLastActive("nonexistent")).not.toThrow();
  });

  it("does not crash when the config file does not exist", () => {
    expect(() => setLastActive("anything")).not.toThrow();
  });

  it("lastOpened is strictly later than the old value after the call", () => {
    const oldTimestamp = "2020-01-01T00:00:00.000Z";
    const brain = makeBrain({ id: "time-check", lastOpened: oldTimestamp });
    seedConfig([brain]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-31T23:59:59.000Z"));

    setLastActive("time-check");

    const stored = JSON.parse(fakeStore!);
    const updated = stored.brains[0];
    expect(new Date(updated.lastOpened) > new Date(oldTimestamp)).toBe(true);
  });
});
